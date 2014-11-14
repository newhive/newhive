import re, pymongo, bson.objectid, random, urllib, urllib2, os, time, json, math
from pymongo.cursor import Cursor as PymongoCursor
from ast import literal_eval
from tempfile import mkstemp
from os.path import join as joinpath
from md5 import md5
from datetime import datetime
from lxml import html
from wsgiref.handlers import format_date_time
from itertools import ifilter, islice, izip_longest, chain
from functools import partial
import Image as Img
from PIL import ImageOps
from bson.code import Code
from crypt import crypt
from oauth2client.client import OAuth2Credentials
# TODO-cleanup?: remove snapshots from webserver?
import Queue
import threading
from subprocess import call

import newhive
from newhive.oauth import (FacebookClient, FlowExchangeError,
    AccessTokenCredentialsError)
#import pyes
from collections import Counter
from snapshots import Snapshots

from s3 import S3Interface

from newhive import config
from newhive.config import abs_url, url_host
from newhive.utils import (now, junkstr, dfilter, normalize, normalize_tags,
    tag_string, cached, AbsUrl, log_error, normalize_word)
from newhive.routes import reserved_words
from newhive import social_stats

from newhive.profiling import g_flags
from newhive.notifications import gcm

import logging
logger = logging.getLogger(__name__)

entity_types = []
def register(entity_cls):
    entity_types.append(entity_cls)
    return entity_cls


class Database:
    def __init__(self, config=None, assets=None):
        config = self.config = (config if config else newhive.config)

        self.con = pymongo.MongoClient(host=config.database_host,
            port=config.database_port)
        self.mdb = self.con[config.database]

        self.s3 = S3Interface(config)
        self.assets = assets

        self.collections = map(
            lambda entity_type: entity_type.Collection(self, entity_type),
            entity_types )
        for col in self.collections:
            setattr(self, col.entity.__name__, col)

    def build_indexes(self):
        for col in self.collections:
            for index in col.entity.indexes:
                if isinstance(index, tuple) and isinstance(index[1], dict):
                    (key, opts) = index
                else: (key, opts) = (index, {})
                opts.setdefault('background', True)
                key = map(lambda a: a if isinstance(a, tuple) else (a, 1),
                    [key] if not isinstance(key, list) else key)
                col._col.ensure_index(key, **opts)

    # arg{id}: if not None, ensure this result appears in the feed
    def query_echo(self, q, expr_only=None, viewer=None, search_id=None, **args):
        args['viewer'] = viewer
        search = self.parse_query(q)
        results = []
        if search.get('auth'):
            args['auth'] = ('public' if
                search['auth'] == 'public' else 'password')

        # Loop, expanding limit, until either the expression "search_id" is 
        # found or 500 limit is exceeded
        while True:
            spec = {}
            # TODO-feature-search-user-collection-syntax: make better syntax
            #     for @fooPerson #bar, like /foo/tag/bar or @foo#bar
            # TODO-feature-search-structured-tags: make key-value tags like
            #     #price:500..1000 or #location:37.7,-122.4 , etc

            feed = search.get('feed')
            tags = search.get('tags', [])
            user = search.get('user')
            if feed:
                # if feed == 'network':
                #     results =  viewer.feed_recent()
                # elif feed == 'trending':
                #     results =  viewer.feed_page_esdb(at=start, limit=limit)
                if feed == 'featured':
                    results = self.Expr.page(
                        self.User.root_user['tagged']['Featured'], **args)
                elif feed == 'recent':
                    results = self.Expr.page({}, **args)
                elif feed == 'trending':
                    results = viewer.feed_trending(**args)
            elif any(k in search for k in ('tags', 'phrases', 'text', 'user')):
                owner = None

                if user and len(tags) == 1:
                    # if search has user and one tag,
                    # look for specific ordered list in user record
                    owner = self.User.named(user)
                if owner and tags[0] == "Profile":
                    results = owner.profile(**dfilter(['at', 'limit'], args))
                elif owner and owner.get('tagged', {}).has_key(tags[0]):
                    # TODO-perf: look for search_id directly and modify limit as needed
                    results = self.Expr.page(owner['tagged'][tags[0]], **args)
                else:
                    if search.get('tags'):
                        spec['tags_index'] = {'$all': search['tags']}
                    if search.get('text'):
                        # spec['$or'] = [{'text_index': {'$all': search['text']}},
                        #     {'title_index': {'$all': search['text']}}]
                        # spec['$and'] = [ {'$or': [{'title_index': text}, 
                        #     {'text_index': text}, {'tags_index': text}]}
                        #     for text in search.get('text')]
                        # V0: body OR title contained ALL search terms.
                        # V1: EACH text term is found in body OR title OR tags
                        # V2: same as v1, but text index contains words in
                        #     title, tags, and text_index for efficiency
                        spec['$and'] = [{'text_index': text} for text in
                            search.get('text')]
                    if search.get('user'):
                        spec['owner_name'] = search['user']
                    results = self.Expr.page(spec, **args)
                    # results = self.esdb.paginate(search, es_order=es_order, fuzzy=fuzzy,
                    #    sort='score', **args)
            else:
                sort = 'updated'
                results = self.Expr.page(spec, **args)
                if not expr_only:
                    results = results + self.User.page(spec, **args)
                    results.sort(cmp=lambda x, y: cmp(x[sort], y[sort]),
                        reverse=True)

            if( not search_id or len(results) > 500 or
                args.get('limit', 27) > 1000
            ): break;
            if len(filter(lambda x: x.id == search_id, results)):
                break;
            args['limit'] = (args.get('limit', 27) * 3/2)

        return results, search

    def query(self, *args, **kwargs):
        return self.query_echo(*args, **kwargs)[0]

    def parse_query(self, q):
        """ Parses search query into MongoDB spec
            #tag, @user, text, #SpecialCategory
        """

        # split into words with possible [@#] prefix, isolate phrases in quotes

        search = {'text': [], 'tags': [], 'phrases': [], 'feed': [] }
        # q_quotes = re.findall(r'"(.*?)"', q, flags=re.UNICODE)
        # q_no_quotes = re.sub(r'"(.*?)"', '', q, flags=re.UNICODE)
        # search['phrases'].extend(q_quotes)

        for pattern in re.findall(r'(\b\w+)|(\@|\#)((\w|[-:])+)', q):
            prefix = pattern[1]
            if prefix != '': pattern = pattern[1:]
            if prefix == '@': search['user'] = pattern[1].lower()
            elif prefix == '#':
                if pattern[1] == 'Public': search['auth'] = 'public'
                elif pattern[1] == 'Private': search['auth'] = 'password'
                elif pattern[1] in [
                    'Featured', 'Recent', 'Network', 'Trending',
                    'Activity', 'Followers', 'Following', 'Loves',
                ]:
                    search['feed'] = pattern[1].lower()
                elif pattern[1] in [
                    'Profile',
                ]:
                    search['tags'].append( pattern[1] )
                else: 
                    search['tags'].append( normalize_word(pattern[1]) )
            else: search['text'].append( normalize_word(pattern[0]) )

        for k in ['text', 'tags', 'phrases', 'feed']:
            if len(search[k]) == 0:
                del search[k]

        return search

    ####################################################################
    # Misc database utility functions
    ####################################################################

    # Add or promote an item in the featured list
    def add_featured(self, expr_id):
        return self.User.root_user.add_promote_tagged(expr_id, "Featured")

    # pop one item off the queue and push it onto the featured list
    def pop_featured_queue(self):
        ru = self.User.root_user
        tagged = ru.tagged
        featured_queue = tagged.get('_featured', [])
        if len(featured_queue) == 0: 
            return

        expr_id = featured_queue[0]
        self.add_featured(expr_id)
        ru.reload()
        tagged = ru.tagged
        tagged['_featured'] = featured_queue[1:]
        ru.update(updated=False, tagged=tagged)

class Collection(object):
    trashable = True

    def __init__(self, db, entity):
        self.db = db
        self._col = db.mdb[entity.cname]
        self.entity = entity
        self.config = db.config

    def fetch_empty(self, key, keyname='_id'):
        return self.find_empty({ keyname : key })

    def fetch(self, key, keyname='_id', **opts):
        if isinstance(key, list):
            return list(self.search(key, **opts))
        else:
            return self.find({ keyname : key }, **opts)

    def find_empty(self, spec, **opts):
        res = self.find(spec, **opts)
        return res if res else self.new({})

    def find(self, spec, **opts):
        r = self._col.find_one(spec, **opts)
        if not r: return None
        return self.new(r)

    def search(self, spec, filter={}, **opts):
        if isinstance(spec, list):
            items = {}
            res = []
            filter.update({'_id': {'$in': spec }})
            for e in self.search(filter, **opts):
                items[e.id] = e
            for i in spec:
                if items.has_key(i): res.append(items[i])
            return res
        # for DB optimization / debugging
        if False:
            print spec, opts
        return Cursor(self, spec=spec, **opts)
        # can't figure out as_class param, which seems to not be passed an arg
        #return self._col.find(spec=spec, as_class=self.new, **opts)

    def last(self, spec={}, **opts):
        opts.update({'sort' : [('updated', -1)]})
        return self.find(spec, **opts)

    def paginate(self, spec, limit=20, at=0, sort='updated', 
        order=-1, filter={}, **args
    ):
        # page_is_id = is_mongo_key(at)
        # if at and not page_is_id:
        at = int(at)
        limit = int(limit)

        if isinstance(spec, dict):
            # if page_is_id:
            #     page_start = self.fetch(at)
            #     at = page_start[sort] if page_start else None

            # if at and sort:
            #     spec[sort] = { '$lt' if order == -1 else '$gt': at }

            res = self.search(spec, sort=[(sort, order)], filter=filter,
                skip=at, **args)

            # collapse to limit long list, omitting filtered results
            res = [r for r in islice(res, limit)]
            return res

        elif isinstance(spec, list):
            # spec = uniq(spec)
            # assert( not at or page_is_id )

            try:
                # start = spec.index(at) if at else -1
                start = at
                end = start + limit * -order
                if end > start:
                    if start >= len(spec): return []
                    sub_spec = spec[start:end]
                else:
                    if start <= 0: return []
                    if end - 1 < 0:
                        sub_spec = spec[start-1::-1]
                    else:
                        sub_spec = spec[start-1:end-1:-1]
            except ValueError:
                # paging element not in list
                if order < 0:
                    end = limit
                    sub_spec = spec[0: end]
                else:
                    return []

            res = self.search(sub_spec, filter=filter)

            return res

    # default implementation of pagination, intended to be overridden by
    # specific model classes
    def page(self, spec, sort='updated', **opts):
        return self.paginate(spec, **opts)

    def count(self, spec={}): return self.search(spec).count()

    # self.new can be overridden to return custom object types
    def new(self, doc): return self.entity(self, doc)

    def create(self, doc):
        new_entity = self.new(doc)
        return new_entity.create()

    def map_reduce(self, *a, **b):
        return self._col.map_reduce(*a, **b)

class Cursor(PymongoCursor):
    def __init__(self, collection, *args, **kwargs):
        self._nh_collection = collection
        super(Cursor, self).__init__(collection._col, *args, **kwargs)

    def next(self):
        return self._nh_collection.new(super(Cursor, self).next())

class Entity(dict):
    """Base-class for very simple wrappers for MongoDB collections"""
    indexes = []
    Collection = Collection

    @property
    def type(self): return self.__class__.__name__

    def __init__(self, collection, doc):
        self.id = doc.get('id')
        doc.pop('id', None)  # Prevent id and _id attributes going into MongoDB
        dict.update(self, doc)

        self.collection = collection
        self._col = self.collection._col
        self.db = collection.db
        self.mdb = self.db.mdb

    @property
    def id(self):
        return self['_id']

    @id.setter
    def id(self, v):
        self['_id'] = v

    def create(self):
        if not self.id: self.id = str(bson.objectid.ObjectId())
        self['created'] = now()
        self['updated'] = now()
        self._col.insert(self, safe=True)
        return self

    def entropy(self, force_update = False):
        if force_update or (not self.get('entropy')):
            self['entropy'] = junkstr(8)
        return self['entropy']

    # should be avoided, because it clobbers record. Use update instead
    def save(self, updated=True):
        if updated: self['updated'] = now()
        return self.update_cmd(self)

    def reload(self):
        dict.update(self, self.collection.fetch(self.id))

    def update(self, **d):
        if not d.has_key('updated'): d['updated'] = now()
        elif not d['updated']: del d['updated']
        dict.update(self, d)
        return self._col.update({ '_id' : self.id }, { '$set' : d },
            safe=True)

    def update_cmd(self, d, **opts): 
        return self._col.update({ '_id' : self.id }, d, **opts)

    def inc(self, key, value=1):
        """Increment key counter by value."""
        return self.increment({key:value})[key]
    
    def reset(self, key, value=0):
        d = {key:value, 'updated':False}
        self.update(**d)
        return value

    def increment(self, d):
        """Increment counter(s) identified by a dict.
        For example {'foo': 2, 'bar': -1, 'baz.qux': 10}"""
        fields = { key: True for (key, v) in d.items() }
        res = self._col.find_and_modify({ '_id' : self.id },
            {'$inc': d }, fields=fields, new=True)
        dict.update(self, res)
        # del res['_id']
        return res

    def flag(self, name):
        return self.update_cmd({'$set': {'flags.' + name: True}})

    def unflag(self, name):
        return self.update_cmd({'$set': {'flags.' + name: False}})

    def flagged(self, name):
        if self.has_key('flags'):
            return self['flags'].get(name, False)
        else:
            return False

    def delete(self):
        res = self._col.remove(spec_or_id=self.id, safe=True)
        if self.Collection.trashable:
            self.db.Trash.create(self.cname, self)
        return res

    def undelete(self, trash=None):
        pass

    def purge(self):
        res = self._col.remove(spec_or_id=self.id, safe=True)
        return res

# Common code between User and Expr
class HasSocial(Entity):
    # social things happen to have passwords
    def create(self):
        if self.has_key('password'):
            self['password'] = mk_password(self['password'])
        super(HasSocial, self).create()
        return self
    def update(self, **d):
        if d.get('password'):
            d['password'] = mk_password(d['password'])
        super(HasSocial, self).update(**d)
        return self
    def cmp_password(self, v):
        password = self.get('password')
        if not password: return True
        if v == None:
            v = ''
        if not isinstance(v, (str, unicode)): return False
        # TODO: Test this with non-ascii text
        if password == v: return True
        return (crypt(v.encode('UTF8'), password) == password)

    @property
    @cached
    def starrer_ids(self):
        return [i['initiator'] for i in
            self.db.Star.search({ 'entity': self.id }) ]

    @property
    def star_count(self): return len(self.starrer_ids)

    def starrer_page(self, **args):
        return self.db.User.page(self.starrer_ids, **args)

    def stars(self, spec={}):
        """ Feed records indicating who is listening to or likes this entity """
        spec.update({'entity': self.id })
        return self.db.Star.search(spec)

    @property
    @cached
    def broadcast_count(self):
        return self.db.Broadcast.search({ 'entity': self.id }).count()


######## Categories
def make_collection(username, tag):
    if not isinstance(username, basestring):
        username = username.get('name')
    if not isinstance(username, basestring):
        raise Error("invalid username")
    return { 'username': username, 'tag': tag }

def make_category(name):
    return { 'name': name, 'collections': [] }

def add_to_category(category, collection):
    category['collections'] += [collection]

# client view of a collection
def collection_client_view(db, collection, ultra=False, viewer=None,
    override_unlisted=False, thumbs=True
):
    ## we have just a single expr
    if isinstance(collection, basestring):
        expr = db.Expr.fetch(collection)
        if not expr: return None
        if not override_unlisted and viewer and not viewer.can_view(expr):
            return None
        expr_cv = expr.client_view(viewer=viewer)
        # individual pages can appear in categories, so this gets
        # a collection attribute that's actually its own id
        expr_cv.update({
            'collection': collection
            ,"snapshot_tiny": expr.snapshot_name("tiny")
            ,"snapshot_small": expr.snapshot_name("small")
            ,"snapshot_big": expr.snapshot_name("big")
        })
        if ultra: expr_cv["snapshot_ultra"] = expr.snapshot_name("ultra")
        return expr_cv

    ## it's a real collection

    username = collection.get('username')
    if not username: return None
    owner = db.User.named(username)
    if not owner: return None
    tag = collection.get('tag')
    limit = 40 if ultra else 4
    if tag: 
        exprs = owner.get_tag(tag)
        if not exprs: return None
        el = db.Expr.fetch(exprs[0:limit])
        search_query = "@%s #%s" % (username, tag)
    else:
        search_query = "@%s" % (username,)
        exprs = db.query(search_query, limit=limit)
        el = exprs
    
    search_query= "q=" + search_query
    expr = el[0]
    if not expr: return None
    if not override_unlisted and viewer and not viewer.can_view(expr):
        return None

    expr_cv = {
        # TODO-perf: trim this to essentials
        "owner": owner.client_view(viewer=viewer)
        ,"snapshot_tiny": expr.snapshot_name("tiny")
        ,"snapshot_small": expr.snapshot_name("small")
        ,"snapshot_big": expr.snapshot_name("big")
        ,"title": tag or "Newhives by " + username
        ,"collection": collection
        ,"type": "cat"
        # These are for the expression route
        ,"expr": {
            "owner_name": expr['owner_name']
            ,"name": expr['name']
            ,"id": expr.id
            ,"search_query": search_query
        }
    }
    if ultra: expr_cv["snapshot_ultra"] = expr.snapshot_name("ultra")
    if thumbs:
        expr_cv["thumbs"] = []
        if len(el) > 1: 
          for i in xrange(1 if len(el) > 2 and not ultra else 0, len(el)):
            expr = el[i]
            expr_cv["thumbs"].append({
                "owner_name": expr['owner_name']
                ,"name": expr['name']
                ,"id": expr.id
                ,"search_query": search_query
                ,"snapshot_tiny": expr.snapshot_name("tiny")
                ,"snapshot_small": expr.snapshot_name("small")
                ,"snapshot_big": expr.snapshot_name("big")
            })
            if ultra:
                expr_cv["thumbs"][-1]["snapshot_ultra"] = (
                    expr.snapshot_name("ultra") )

    # determine if this is an owned or curated collection
    # for "by USER" or "curated by USER" on card
    if tag:
        owned_exprs = (db.Expr.search(
            {'owner': owner.id, '_id': {'$in': exprs}}))
        expr_cv['curated'] = not (
            owned_exprs and (owned_exprs.count() == len(exprs)))
    else:
        expr_cv['curated'] = False
        
    return expr_cv

################

@register
class User(HasSocial):
    cname = 'user'
    indexes = [
        ('updated', -1),
        ('name', {'unique': True}),
        'facebook.id',
        'email',
        'text_index'
    ]

    # fields = dict(
    #     name = str
    #    ,password = str
    #    ,fullname = str
    #    ,sites = [str]
    #    ,feed = [Feed]
    #    ,analytics = dict(
    #         InviteNote = Counter
    #        ,expressions = Counter
    #    ,referrer = User
    #    ,referrals = int
    #    ,email = str
    #    ,flags = { str : int|bool }
    #    ,notification_count = int
    # )

    class Collection(Collection):
        def named(self, name): return self.find({'name' : name})

        def find_by_facebook(self, id):
            return self.find({ 'facebook.id': id,
                'facebook.disconnected': {'$exists': False} })

        def get_root(self): return self.named('root')
        root_user = property(get_root)

        @property
        def site_user(self):
            return self.named(self.config.site_user)

    def __init__(self, *a, **b):
        super(User, self).__init__(*a, **b)
        self.logged_in = False
        self.fb_client = None
        self.owner = self

    def expr_create(self, d):
        doc = dict(d)
        doc.update(owner=self.id)
        doc.setdefault('name', '')
        return self.db.Expr.create(doc)

    def create(self):
        self['name'] = self['name'].lower()
        # self['signup_group'] = self.collection.config.signup_group
        assert re.match('[a-z0-9]{3,24}$', self['name']) != None, (
            'Invalid username')
        assert not (self['name'] in reserved_words)
        dict.update(self,
            fullname = self.get('fullname', self['name']),
            referrals = 0,
            flags = {},
        )
        # self['email_subscriptions'] = (
        #     self.collection.config.default_email_subscriptions )

        self.build_search(self)
        self.get_expr_count(force_update=True)
        super(User, self).create()
        return self

    def update(self, **d):
        self.build_search(d)
        super(User, self).update(**d)
        return self

    @property
    def notification_count(self): return self.get('notification_count', 0)

    def notification_count_reset(self): self.update(notification_count=0)

    def notify(self, feed_item):
        self.setdefault('notification_count', 0)
        self['notification_count'] += 1
        self.increment({'notification_count': 1})

    @property
    @cached
    def my_stars(self):
        """ Feed records indicating what newhives a user likes and who they're
            listening to """
        return list( self.db.Star.search({ 'initiator': self.id },
            sort=[('created', -1)]) )

    @property
    @cached
    def starred_user_ids(self):
        return [ i['entity'] for i in self.my_stars
            if i['entity_class'] == 'User' ]

    @property
    def starred_expr_ids(self):
        return [ i['entity'] for i in self.my_stars
            if i['entity_class'] == 'Expr' ]

    def starred_user_page(self, **args):
        return self.collection.page(self.starred_user_ids, **args)

    @property
    @cached
    def broadcast(self):
        return self.db.Broadcast.search({ 'initiator': self.id })

    @property
    def broadcast_ids(self): return [i['entity'] for i in self.broadcast]

    ##################### Categories
    def get_cats(self):
        # sort reordered tags to front of list
        ordered_tags = self.get('ordered_cats', [])
        # concat the lists and possibly the empty tag_name
        all_tags = (ordered_tags + 
            [x for x in self.category_names() if x not in ordered_tags])
        return (len(ordered_tags), all_tags)

    def categories(self, at=0, limit=0):
        return self.get('categories', [])[at:limit + at if limit else None]

    def category_names(self, at=0, limit=0):
        return [x.get('name') for x in self.categories(at=at, limit=limit)]

    # def categories_ordered(self):
    #     cats = self.category_names()
    #     return cats

    def get_category(self, name, force=False):
        categories = filter(lambda c: c.get('name') == name, self.categories())
        if categories: return categories[0]
        if force:
            category = make_category(name)
            self.add_category(category)
            return category
        return None

    def add_category(self, cat):
        cats = self.categories() + [cat]
        self.update(updated=False, categories=cats)

    def remove_category(self, cat):
        cats = filter(lambda c: c.get('name') != cat, self.categories())
        self.update(updated=False, categories=cats)

    def add_to_category(self, cat_name, collection):
        category = self.get_category(cat_name, force=True)
        add_to_category(category, collection)
        self.update(updated=False, categories=self.categories())

    def get_category_collections(self, name):
        res = self.get_category(name, force=True)
        return res.get('collections')

    def set_category_collections(self, name, collections):
        res = self.get_category(name, force=True)
        res['collections'] = collections
        self.update(updated=False, categories=self.categories())

    # convenience
    def make_collection(self, col_name):
        return make_collection(self, col_name)
    #####################

    @property
    def tagged(self):
        return self.get('tagged', {})

    def add_to_collection(self, expr_id, tag_name, add_to_back=False):
        expr = self.db.Expr.fetch(expr_id)
        if not expr:
            return False

        tagged = self.tagged
        collection = self.get_tag(tag_name, force_update=True)
        if add_to_back:
            collection = collection + [expr_id]
        else:
            collection = [expr_id] + collection
        tagged[tag_name] = collection

        # add the tag on owned expression
        if expr.owner.id == self.id:
            expr.update(updated=False, 
                tags=(expr.get('tags','') + ' #' + tag_name).strip())
        self.update(tagged=tagged)
        return True

    # Add or promote an item in a tagged list
    def add_promote_tagged(self, expr_id, tag_name):
        if not self.db.Expr.fetch(expr_id):
            return False

        collection = self.get_tag(tag_name, force_update=True)
        # Filter the given id out of the list (so it can be promoted)
        if expr_id in collection:
            collection.remove(expr_id)
            self.tagged[tag_name] = [expr_id] + collection
            self.update(tagged=self.tagged)
            return True

        # New expression handled in default manner
        self.add_to_collection(expr_id, tag_name)

        return True

    def calculate_tags(self):
        public_cnt = Counter()
        unlisted_cnt = Counter()
        for expr in self.expressions:
            for tag in expr.get('tags_index', []):
                unlisted_cnt[tag] += 1
                if expr.get('auth', 'unlisted') == 'public':
                    public_cnt[tag] += 1
        for cnt in [public_cnt, unlisted_cnt]:
            top = cnt.most_common(1)[0][1] if cnt.keys() else 0
            #TODO: need to actually differentiate each expression by auth
            for tag, tagged in self.get('tagged', {}).items():
                if len(tagged):
                    cnt[tag] += top + len(tagged)
        tag_entropy = self.get('tag_entropy', {})
        for tag, x in unlisted_cnt.most_common():
            tag_entropy.setdefault(tag, junkstr(6))
        self.update(public_tags = public_cnt, unlisted_tags = unlisted_cnt,
            tag_entropy=tag_entropy)

    def get_tags(self, privacy, remove_singletons=True):
        cnt = Counter( self.get('unlisted_tags'
            if privacy else 'public_tags', {}) )
        # remove single-expression tags
        if remove_singletons:
            single_count = set(cnt.keys())
            cnt -= Counter(single_count)
        # sort reordered tags to front of list
        ordered_tags = self.get('ordered_tags', [])
        for key in ordered_tags:
            del cnt[key]
        # concat the lists and possibly the empty tag_name
        all_tags = ordered_tags + [x for x,y in cnt.most_common()]
        return (len(ordered_tags), all_tags)

    def get_tag(self, tag, limit=0, force_update=False):
        tagged = self.get('tagged', {})
        expression_id_list = tagged.get(tag, [])

        if not expression_id_list: 
            # List missing. calculate it.
            expression_list = self.db.Expr.search({
                'owner': self.id, 'tags_index': tag }, sort=[('updated',-1)] )
            if expression_list:
                expression_id_list = map(lambda e: e.id, expression_list)
            if force_update:
                tagged[tag] = expression_id_list
                self.update(updated=False, tagged=tagged)

        return expression_id_list if not limit else expression_id_list[:limit]

    def can_view(self, expr):
        return expr and (
            (expr.get('auth', 'public') == 'public') or
            (self.id == expr['owner'])
        )

    def can_view_filter(self):
        """Creates an elasticsearch filter corresponding to can_view"""
        f = [pub_filter, pyes.filters.TermFilter('owner', self.id)]
        if len(self.starred_expr_ids)>0:
            f.append(pyes.filters.IdsFilter(self.starred_expr_ids))
        return pyes.filters.BoolFilter(should=f)

    def activity(self, limit=100, **args):
        if not self.id: return []
        # TODO-feature: create list of exprs user is following comments on in
        # user record, so you can leave a comment thread
        commented_exprs = [r['entity'] for r in
            self.db.Comment.search({'initiator': self.id})]
        return self.db.Feed.paginate({'$or': [
            {'entity_owner': self.id},
            {'initiator': self.id},
            {'entity': {'$in': commented_exprs}, 'class_name': 'Comment'}
        ]}, limit=limit, **args)

    def feed_profile_entities(self, **args):
        res = self.feed_profile(**args)
        for i, item in enumerate(res):
            if item.type == 'FriendJoined': continue
            entity = ( item.initiator if item.entity.id == self.id
                else item.entity )
            entity['feed'] = [item]
            res[i] = entity
        return res

    def network_feed_items(self, limit=0, at=0):
        # get iterable for all feed items in your network
        user_action = {
                'initiator': {'$in': self.starred_user_ids},
                'class_name': {'$in': ['NewExpr', 'Broadcast', 'Star', 'Remix']}
                }
        own_broadcast = { 'initiator': self.id, 'class_name': 'Broadcast' }
        expression_action = {
                'entity': {'$in': self.starred_expr_ids}
                , 'class_name': {'$in':['Comment', 'UpdatedExpr']}
                , 'initiator': { '$ne': self.id }
                }
        or_clause = [user_action, own_broadcast, expression_action]
        return self.db.Feed.search({ '$or': or_clause }, limit=limit,
            sort=[('created', -1)]).hint([('created', -1)])

    def exprs_tagged_following(self, per_tag_limit=20, limit=0):
        # return iterable of matching expressions for each tag you're following
        tags = self.get('tags_following', [])
        queries = [ self.db.query('#' + tag, limit=per_tag_limit)
            for tag in tags ]
        flat = list(filter(lambda x:x != None, chain(*izip_longest(*queries))))
        if limit:
            return flat[0:limit]
        return flat

    # TODO-polish merge with db.query to enable searching within feed
    def feed_trending(self, at=0, limit=20, viewer=None):
        at = int(at)
        limit = int(limit)
        items = self.network_feed_items(limit=500)
        exprs = self.db.Expr.fetch([r['entity'] for r in items])
        exprs.extend(self.exprs_tagged_following(500))

        query_time = now()
        def popularity_time_score(expr):
            return (
                expr.get_count('Broadcast') * 500 +
                expr.get_count('Star') * 100 +
                expr.get_count('Comment') * 20 -
                math.pow(1.4, abs((expr['created']-query_time)/86400))
                )

        exprs_by_id = {}
        for expr in exprs:
            if expr and expr.get('auth') == 'public':
                expr['score'] = popularity_time_score(expr)
                exprs_by_id[expr.id] = expr
        # TODO-perf: move this into MongoDB (mapreduce)
        result = sorted(exprs_by_id.values(),
            key=lambda x: x['score'], reverse=True)
        return result[at:at+limit]

    # TODO-polish merge with db.query to enable searching within feed
    def feed_recent(self, spec={}, limit=20, at=0, **args):
        at=int(at)
        limit=int(limit)
        feed_items = [item for item in
            self.network_feed_items(limit=g_flags['feed_max'], at=0)]
        tagged_exprs = list(self.exprs_tagged_following())

        exprs = {}
        result = []
        def add_expr(r):
            if exprs.get(r['_id']):
                return r
            r['feed'] = []
            exprs[r['_id']] = r
            result.append(r)
            return r
        
        # get expressions that are tagged
        for r in tagged_exprs:
            if not exprs.get(r.id):
                item = add_expr(r)
        # get expressions that are mentioned in feeds
        for r in feed_items:
            _id = r['entity']
            item = exprs.get(_id)
            if not item:
                item = add_expr({'_id':_id, 'updated':0})
            if item:
                # item update is the most recent of all its feed items
                item['updated'] = max(item['updated'], r['updated'])
                if (r['class_name'] != 'NewExpr') and len(item['feed']) < 3:
                    item['feed'].append(r)

        # sort by inverse time
        sorted_result = sorted( result, key = lambda r: r['updated'],
            reverse = True )
        needed = at + limit
        start = 0
        end = at + limit + 5
        records = []
        while len(records) < needed:
            # only fetch the expressions not yet fetched
            new_records = self.db.Expr.fetch(
                [e['_id'] for e in sorted_result[start:end] 
                if not e.get('name')])
            if len(new_records) == 0:
                break
            for r in new_records:
                exprs[r['_id']].update(r)
            # filter to public only
            records = [ e for e in sorted_result[:end]
                if e.get('auth') == 'public' ]
            if end > len(sorted_result):
                break
            start = end
            end = int(end*1.5)
        return map(lambda e: Expr(self.db.Expr, e), records[at:at + limit])

    def profile_spec(self):
        return {'initiator': self.id,
            'class_name': {'$in': ['Broadcast','UpdatedExpr','NewExpr','Remix']}
        }

    # TODO-performance-cleanup: make profile query that uses $match, $sort, and
    # $group that outputs the correct profile feed items. Consider de-
    # normalizing entity.auth into feed
    def profile2(self, limit=20, at=0):
        pass

    def profile(self, limit=20, at=0):
        at=int(at)
        limit=int(limit)
        spec = self.profile_spec()
        result = []
        exprs = {}
        for r in self.db.Feed.search(spec, sort=[('updated', -1)]):
            if len(result) >= (limit + at): break
            expr_id = r['entity']
            expr = r.entity
            if r.get('entity_other_id'):
                expr_id = r.get('entity_other_id')
                expr = self.db.Expr.fetch(expr_id)
            if exprs.get(expr_id): continue
            exprs[expr_id] = True
            if expr and expr.get('auth') == 'public':
                result.append(expr)
        return result[at:]

    # # wrapper around db.query('#Trending') to add recent feed items
    # def feed_trending(self, **paging_args):
    #     self.db.query('#Trending')

    def build_search(self, d):
        d['text_index'] = normalize(
            d.get('name', self.get('name', '')) + ' ' +
            d.get('fullname', self.get('fullname', ''))
        )

    def new_referral(self, d):
        d.update(user = self.id)
        return self.db.Referral.create(d)

    def give_invites(self, count):
        self.increment({'referrals':count})
        self.db.InviteNote.create( self.db.User.named(self.db.config.site_user),
            self, data={'count':count} )

    def cmp_password(self, v):
        if not isinstance(v, (str, unicode)): return False
        return crypt(v.encode('UTF8'), self['password']) == self['password']

    def check_password(self, password):
        if len(password) < 4:
            return 'Passwords must be at least 4 characters long'
        return False

    def get_url(self, path='profile/', relative=False, secure=False):
        if not self.id: return ''
        base = '/' if relative else abs_url(secure=secure)
        return base + self.get('name', '') + '/' + path
    url = property(get_url)

    def get_thumb(self, size=222):
        thumb = False
        thumb_file = self.db.File.fetch(self.get('thumb_file_id'))
        if thumb_file:
            return thumb_file.get_thumb(size, size)
        else: return False
    thumb = property(get_thumb)

    def get_files(self):
        return self.db.File.search({ 'owner' : self.id })
    files = property(get_files)

    #TODO-bug: when deleting/adding expression, this lags by one.
    def set_expr_count(self):
        count = self.mdb.expr.find({ "owner": self.id, "apps":
            {"$exists": True, "$not": {"$size": 0}}, "auth": "public"}).count()
        self.update_cmd({"$set": {'analytics.expressions.count': count}})
        return count

    def get_expr_count(self, force_update=False):
        if force_update:
            count = self.set_expr_count()
        else:
            try:
                count = self['analytics']['expressions']['count']
            except KeyError:
                count = self.set_expr_count()
        return count
    expr_count = property(get_expr_count)

    def _has_homepage(self):
        return bool( self.mdb.expr.find({'owner': self.id,
            'apps': {'$exists': True}, 'name': ''}).count() )
    has_homepage = property(_has_homepage)

    @property
    def facebook_credentials(self):
        if not hasattr(self, '_facebook_credentials'):
            if self.has_key('oauth') and self['oauth'].has_key('facebook'):
                self._facebook_credentials = OAuth2Credentials.from_json(
                    json.dumps(self['oauth']['facebook']))
            else: return None
        return self._facebook_credentials

    @facebook_credentials.setter
    def facebook_credentials(self, value):
        self._facebook_credentials = value

    def save_credentials(self, credentials, profile=False):
        # Do nothing if not an in-database user
        if not self.id: return False

        upd = { 'oauth': self.get('oauth', {}) }
        if profile:
            upd['facebook'] = self.fb_client.me()
        upd['oauth']['facebook'] = json.loads(credentials.to_json())
        self.update(**upd)

    @property
    def facebook_id(self):
        if self.has_key('facebook'): return self['facebook'].get('id')
        else: return False

    @property
    def fb_thumb(self):
        if self.has_key('facebook'):
            return ( "https://graph.facebook.com/" + self.facebook_id
                + "/picture?type=square" )

    @property
    def fb_name(self):
        if self.has_key('facebook'):
            return self['facebook']['name']

    def facebook_disconnect(self):
        if( self.facebook_credentials and not
            self.facebook_credentials.access_token_expired
        ):
            fbc = FacebookClient()
            try:
                fbc.delete('https://graph.facebook.com/me/permissions',
                    self.facebook_credentials)
            except (FlowExchangeError, AccessTokenCredentialsError) as e:
                print e
            self.facebook_credentials = None
        # WTF? this doesn't actually disconnect you
        #self.update_cmd({'$set': {'facebook.disconnected': True}})
        self.update_cmd({'$unset': {'facebook': 1}}) # this seems to work
        self.update_cmd({'$unset': {'oauth.facebook': 1}})

    @property
    def has_facebook(self):
        if self.get('facebook') and not self['facebook'].get('disconnected'):
            return True
        else: return False

    @property
    def facebook_friends(self):
        friends = self.fb_client.friends()
        return self.db.User.search({
            'facebook.id': {'$in': [str(friend['uid']) for friend in friends]},
            'facebook.disconnected': {'$exists': False}
        })

    def get_expressions(self, auth=None):
        spec = {'owner': self.id}
        if auth: spec.update(auth=auth)
        return self.db.Expr.search(spec)
    expressions = property(get_expressions)

    # TODO: cache db query
    def get_top_expressions(self, count=6):
        return self.get_expressions( auth='public'
            ).sort([('views', -1)] ).limit(count)
    top_expressions = property(get_top_expressions)

    # TODO: cache db query
    def get_recent_expressions(self, count=6):
        return self.get_expressions( auth='public'
            ).sort([('updated', -1)]).limit(count)
    recent_expressions = property(get_recent_expressions)

    def client_view(self, viewer=None, special={}, activity=0):
        user = self.db.User.new( dfilter( self, [
            'fullname', 'name', 'email', 'profile_about', 'profile_thumb',
            'profile_bg', 'thumb_file_id', 'tags', 'updated', 'created', 'feed'
        ] ) )
        user['type'] = "user"
        ###########################################################
        # TODO: make sure this field is updated wherever views changes elsewhere
        # TODO: figure out best thing to do for empty user
        # TODO: make new class for analytics.
        #   Add tests to verify info survives new views, add/delete loves, users
        if self.has_key('analytics'):
            updates = {}
            if not self['analytics'].has_key('views_by'):
                updates.update({ 'views_by': 
                    sum([ r.get('views', 0) for r in
                        self.db.Expr.search({'owner':self['_id']}) ])
                })
            if not self['analytics'].has_key('loves_by'):
                updates.update({'loves_by':
                    self.db.Feed.search({'entity_owner':self['_id'],
                        'class_name':'Star', 'entity_class': 'Expr'}).count()})
            if len(updates) > 0:
                self['analytics'].update(updates)
                self.update_cmd(self)
            dict.update(user, dict(
                views_by = self['analytics']['views_by'],
                loves_by = self['analytics']['loves_by'],
                # Why expressions->count? nothing else is in there.
                expressions = self.get_expr_count(), 
            ))

        thumb_big = (self.get_thumb(222) or self.get_thumb(190) or
            self.db.assets.url('skin/site/user_placeholder_big.jpg'))
        thumb_small = (self.get_thumb(70) or
            self.db.assets.url('skin/site/user_placeholder_small.jpg'))
        dict.update(user, dict(
            id = self.id,
            url = self.url,
            thumb_small = thumb_small,
            thumb_big = thumb_big,
            has_thumb = (self.get_thumb(222) or self.get_thumb(190) != False),
            logged_in = self.logged_in,
            notification_count = self.notification_count,
        ) )
        if special.has_key("tagged"):
            # dict.update(user, { "tagged": self.get('tagged', {}).keys() })
            #!! TODO-perf: remove after we migrate to run on all users
            # self.calculate_tags()
            update = {}
            (update['tagged_ordered'], update['tagged']) = self.get_tags(True)
            (cats_ordered, categories) = self.get_cats()
            if len(categories):
                (update['cats_ordered'], update['categories']) = (cats_ordered, categories)
            dict.update(user, update)
        if special.has_key("mini_expressions") and g_flags['mini_expressions']:
            exprs = self.get_top_expressions(g_flags['mini_expressions'])
            dict.update(user, dict(
                mini_expressions = map(lambda e:e.mini_view(), exprs)))
        if viewer: dict.update(user, listening = self.id in viewer.starred_user_ids )
        if activity > 0:
            dict.update( user, activity=
                map(lambda r: r.client_view(),
                    list(self.activity(limit=activity))) )
        return user

    def get_home(self):
        ru = self.db.User.root_user
        home = {}
        home['cats'] = cats = ru.get('ordered_cats')
        home['categories'] = {
            cat: [
                collection_client_view(self.db, col, thumbs=False, viewer=self)
                for col in
                ru.get_category(cat)['collections'][:config.cat_hover_count]
            ]
            for cat in cats
        }
        return home

    def get_root_categories(self):
        ru = self.db.User.root_user
        cats = ru.get_cats()
        return cats[1][0:cats[0]]

    def delete(self):
        # Facebook Disconnect
        self.facebook_disconnect()

        # Feed Cleanup
        for feed_item in self.db.Feed.search(
                {'$or': [{'initiator': self.id}, {'entity': self.id}]}):
            feed_item.delete()

        # Expressions Cleanup
        for e in self.expressions:
            e.delete()

        return super(User, self).delete()

    def undelete(self, trash):
        # TODO-undelete: reconnect FB?
        # TODO-undelete: Fix following / followers
        # TODO-undelete: index record.owner
        time = trash.get('updated', now()) - 3600
        for expr in self.db.Trash.search({
            'record.owner': self.id
            ,"updated": {"$gt": time}
            ,'collection': 'expr'
        }):
            expr.undelete() 
        for feed in self.db.Trash.search({
            '$or': [{'record.initiator': self.id}, {'record.entity': self.id}]
            ,"updated": {"$gt": time}
            ,'collection': 'feed'
        }):
            feed.undelete()

    def has_group(self, group, level=None):
        groups = self.get('groups')
        if isinstance(group, list): return False
        if not groups or not group in groups:
            return False
        return level == None or level == groups[group]

    def add_group(self, group, level):
        assert isinstance(group, basestring) and len(group) <=3
        if not self.has_key('groups'): self['groups'] = {}
        self['groups'][group] = level
        #TODO: add warning if groups are too long for google analytics

    def remove_group(self, group):
        groups = self.get('groups')
        if groups:
            if groups.has_key(group): groups.pop(group)

    def groups_to_string(self):
        groups = self.get('groups')
        if not groups: return ''
        return ",".join(["%s%s" % item for item in groups.iteritems()])

    @property
    def is_admin(self):
        return self.get('name') in self.db.config.admins

    def __str__(self):
        return '<newhive.state.User ' + self['name'] +'>'
    def __repr__(self):
        return '<newhive.state.User ' + self['name'] +'>'


@register
class Session(Entity):
    cname = 'session'
    class Collection(Collection):
        trashable = False


def media_path(user, name=None):
    p = joinpath(config.media_path, user['name'])
    return joinpath(p, name) if name else p

@register
class Expr(HasSocial):
    cname = 'expr'
    indexes = [
         (['owner_name', 'name'], {'unique':True})
        ,'url'
        ,['owner', 'updated']
        ,'tags_index'
        ,'text_index'
        ,'updated'
        ,'random'
        ,'file_id'
        ,'created'
    ]
    counters = ['owner_views', 'views', 'emails']
    _owner = None

    class Collection(Collection):
        ignore_not_meta = { 'apps': 0, 'background': 0, 'text_index': 0,
            'title_index': 0, 'file_id': 0, 'images': 0  }

        def named(self, username, name): return self.find({'owner_name': username, 'name': name})

        def fetch(self, key, keyname='_id', meta=False):
            fields = { 'text_index': 0, 'title_index': 0 }
            if meta: fields.update(self.ignore_not_meta)
            return super(Expr.Collection, self).fetch(key, keyname, fields=fields)

        def popular_tags(self):
            map_js = Code("function () {"
                       "  if (!this.tags_index || this.auth != 'public') return;"
                       "  for (index in this.tags_index) {"
                       "    emit(this.tags_index[index], 1);"
                       "  };"
                       "}")
            reduce_js = Code("function (prev, current) {"
                   "  var total = 0;"
                   "  for (index in current) {"
                   "    total += current[index];"
                   "  }"
                   "  return total;"
                   "}")
            result = self.map_reduce(map_js, reduce_js, "popular_tags")
            return map(dict, result.find(sort=[('value', -1)]))

        def with_url(cls, url):
            """ Convenience utility function not used in production, retrieve Expr from path or full URL """
            [user, name] = urllib2.urlparse.urlparse(url).path[1:].split('/', 1)
            return cls.named(user, name)

        def page(self, spec, sort='updated', viewer=None, auth=None,
            override_unlisted=False, **args
        ):
            assert(sort in ['updated', 'random'])
            args.update(sort=sort)

            filter = {}
            spec2 = spec if isinstance(spec, dict) else filter
            # Set up auth filtering
            if auth:
                spec2.update(auth=auth)
            if override_unlisted:
                pass
            elif viewer and viewer.logged_in:
                if auth == 'password':
                    spec2.update({'owner': viewer.id})
                elif not override_unlisted:
                    spec2.setdefault('$and', [])
                    spec2['$and'].append({'$or': [{'auth': 'public'},
                        {'owner': viewer.id}]})
            else:
                spec2.update({'auth': 'public'})

            args.setdefault('fields', self.ignore_not_meta)
            rs = self.paginate(spec, filter=filter, **args)

            # remove random static patterns from random index
            # to make it _really_ random
            if sort == 'random':
                for r in rs: r.update(random=random.random())

            return rs

        def random(self):
            rand = random.random()
            return self.find(dict(random = {'$gte': rand}, auth='public', apps={'$exists': True}))

        @property
        def featured_ids(self):
            return self.db.User.get_root()['tagged']['Featured']

        def featured(self, limit):
            query = self.featured_ids[0:limit]
            return self.db.Expr.fetch(query)

        def unused_name(self, owner=None, name=None):
            if not isinstance(name, basestring) or not len(name) or not owner:
                raise ValueError('Expr / user not found')

            m = re.match("(.*)-([0-9]+)$", name)
            if m:
                base_name = m.group(1)
                num = int(m.group(2))
            else:
                base_name = name
                num = 0
            expr_names = [e['name'] for e in list(self.db.Expr.search({
                'owner': owner.id, 'name': re.compile("^" + base_name + ".*")
            }))]
            while True:
                if num:
                    name = base_name + "-" + str(num)
                else:
                    name = base_name
                if name not in expr_names:
                    return name
                num += 1


    # full_page = True to capture entire expression page, not just snapshot
    # timeout != 0. time in seconds to block before killing thread
    # retry = initial (multiplicate) delay to retry failed snapshots
    def threaded_snapshot(self, full_page=False, time_out=0, retry=0):
        def timeout(func, args=(), kwargs={}, timeout_duration=10, default=None):
            """This function will spawn a thread and run the given function
            using the args, kwargs and return the given default value if the
            timeout_duration is exceeded.
            """ 
            # import threading
            class InterruptableThread(threading.Thread):
                def __init__(self):
                    threading.Thread.__init__(self)
                    self.result = default
                def run(self):
                    self.result = func(*args, **kwargs)
            it = InterruptableThread()
            it.daemon = True
            it.start()
            it.join(timeout_duration)
            if it.isAlive():
                return it.result
            else:
                return default

        def threaded_snapshot_q(q, expr,retry):
            result = timeout(threaded_snapshot, (self,retry), timeout_duration=69)
        def threaded_snapshot(expr, retry):
            # If requested, keep trying to snapshot, with multiplicative delay,
            # until success.
            while True:
                result = (expr.take_full_shot() if full_page else expr.take_snapshots())
                if result or not retry:
                    return result
                time.sleep(retry)
                retry *= 2

        # If we spin up too many threads, block.
        while threading.active_count() > 32:
            # log sleeps to see if server is being pounded.
            # log_error(self.db, message = "Too many snapshot threads", critical=False)
            time.sleep(0.1)

        q = Queue.Queue()

        # t = InterruptableThread(
        t = threading.Thread(target=threaded_snapshot, args = (self,retry))
        # t = threading.Thread(target=threaded_snapshot_q, args = (q,self,retry))
        # result = timeout(threaded_snapshot_q, (q,self), timeout_duration=69)
        t.daemon = True
        t.start()
        if time_out:
            t.join(time_out)
            if t.isAlive():
                # TODO-perf: could be wise to also kill the thread
                return False
        return True

    #TODO-cleanup: remove after snapshot migration
    def snapshot_name_base(self, size, time):
        return '_'.join([self.id, time, self.entropy(), size]) + '.jpg' #(".jpg" if (size == "full") else ".png")

    def snapshot_name_http(self, size):
        res = self.snapshot_name(size)
        if not res:
            return None
        if not res.startswith("http"):
            res = "http:" + res
        return res

    # size is 'big', 'small', or 'tiny'.
    def snapshot_name(self, size="big"):
        if not self.get('snapshot_id'):
            return False

        dimensions = {"big": (715, 430), "small": (390, 235), 
            'tiny': (70, 42), 'ultra': (1600, 960)}
        snapshot = self.db.File.fetch(self.get('snapshot') or self['snapshot_id'])
        dimension = dimensions.get(size, False)
        if not snapshot or not dimension:
            return False
        
        filename = snapshot.get_thumb(dimension[0], dimension[1])
        if not filename and list(dimension) <= snapshot.get('dimensions'):
            filename = snapshot.url
        # Tell the snapshotter to create a snapshot if missing
        if not filename and size == "ultra":
            update = {'updated': False, 'snapshot_time': 0}
            if size == "ultra":
                update['snapshot_ultra'] = True
            self.update(**update)
        return filename

    def stripped_snapshot_name(self, size):
        filename = self.snapshot_name(size)
        if filename.startswith('//'): filename = filename[2:]
        return filename

    def take_full_shot(self):
        snapshotter = Snapshots()

        name = self.snapshot_name_base("full", str(self.get('snapshot_time')))
        if self.db.s3.file_exists('thumb', name):
            return True
        # This would be cleaner with file pipes instead of filesystem.
        local = '/tmp/' + name
        r = snapshotter.take_snapshot(self.id, out_filename=local, full_page=True)
        if not r:
            print 'FAIL'
            return False

        url = self.db.s3.upload_file(local, 'thumb', name, mimetype='image/jpg', ttl=30)
        return True
        # print url

    # Note: this takes snapshots in the current thread.
    # For threaded snapshots, use threaded_snapshot()
    def take_snapshots(self):
        old_time = self.get('snapshot_time', False)

        snapshotter = Snapshots()
        snapshot_time = now()
        dimension_list = [(715, 430, "big"), (390, 235, "small"), (70, 42, 'tiny')]
        if self.get('snapshot_ultra'):
            new = [(1600, 960, "ultra")]
            new.extend(dimension_list)
            dimension_list = new
        upload_list = []
        pw = self.get('password', '')
        self.inc('snapshot_fails')
        self.update(updated=False, snapshot_fail_time=now())

        for w, h, size in dimension_list:
            name = self.snapshot_name_base(size, str(int(snapshot_time)))
            # TODO-cleanup: This would be cleaner with file pipes instead of filesystem.
            local = '/tmp/' + name
            if w == dimension_list[0][0]:
                r = snapshotter.take_snapshot(self.id, dimensions=(w,h),
                    out_filename=local, pw=pw)
                if not r:
                    return False
            else:
                f = open(upload_list[0][0], "r")
                local = generate_thumb(f, (w, h), 'jpeg')
            upload_list.append((local,name))

        it = 0
        for local, name in upload_list:
            file_data = {'owner': self.owner.id,
                'tmp_file': (local if it else open(local, 'r')),
                'name': 'snapshot.jpg', 'mime': 'image/jpeg',
                'generated_from': self.id, 'generated_from_type': 'Expr'}
            if not it:
                file_record = self.db.File.create(file_data)
                file_record['dimensions'] = ( 
                    dimension_list[it][0], dimension_list[it][1])
            else:
                file_record.set_thumb(
                    dimension_list[it][0], dimension_list[it][1], file=local,
                    mime='image/jpeg', autogen=False)
            it += 1
        file_record.save()

        # clean up local files, upload them atomically to s3 (on success)
        # for local, name in upload_list:
        #     url = self.db.s3.upload_file(local, 'thumb', name, mimetype='image/png')
        # need to delete local
        call(["rm", upload_list[0][0]])

        # Delete old snapshot
        if old_time and self.get('snapshot_id'):
            self.db.File.fetch(self.get('snapshot_id')).purge()

        self.update(snapshot_time=snapshot_time, entropy=self['entropy'],
            snapshot_id=file_record.id, updated=False)
        self.reset('snapshot_fails')
        self.update(updated=False, snapshot_fail_time=0)
        return True

    # @property
    def snapshot(self, size='big', update=True):
        # Take new snapshot if necessary and requested
        if update and (not self.get('snapshot_time') or self.get('updated') > self.get('snapshot_time')):
            self.take_snapshots()
        return self.snapshot_name(size)

    def related_next(self, spec={}, **kwargs):
        if isinstance(spec, dict):
            shared_spec = spec.copy()
            shared_spec.update({'auth': 'public', 'apps': {'$exists': True}})
        else: shared_spec = spec
        return super(Expr, self).related_next(shared_spec, **kwargs)

    def related_prev(self, spec={}, **kwargs):
        if isinstance(spec, dict):
            shared_spec = spec.copy()
            shared_spec.update({'auth': 'public', 'apps': {'$exists': True}})
        else: shared_spec = spec
        return super(Expr, self).related_prev(shared_spec, **kwargs)

    def get_owner(self):
        if not self._owner:
            self._owner = self.db.User.fetch(self.get('owner'))
        return self._owner
    owner = property(get_owner)

    def update(self, **d):
        old_tags = self.get('tags_index', [])

        self._collect_files(d)
        self.build_search(d)
        if d.get('auth') == 'public':
            d['password'] = None
        # Reset fails if this is a real update
        if d.get('updated', False): 
            d['snapshot_fails'] = 0
        super(Expr, self).update(**d)

        self.update_owner(old_tags)

    def update_owner(self, old_tags):
        old_tags = set(old_tags)
        self.owner.get_expr_count(force_update=True)
        
        # Update owner's tag list, adding self to appropriate lists
        tagged = self.owner.get('tagged', {})
        tagged_keys = set(tagged.keys())
        old_tags &= tagged_keys
        new_tags = set(self.get('tags_index', [])) & tagged_keys
        both_tags = old_tags & new_tags
        new_tags -= both_tags
        old_tags -= both_tags

        for tag in old_tags:
            tagged[tag] = filter(lambda e_id: e_id != self.id, tagged[tag])
        for tag in new_tags:
            if self.id not in tagged[tag]:
                tagged[tag] = [self.id] + tagged[tag]
        self.owner.update(tagged=tagged, updated=False)
        # TODO-perf: shouldn't need after a migration.
        # Probably easier to leave it in than to update counts here.
        self.owner.calculate_tags()

        return self

    def build_search(self, d):
        tags = d.get('tags', self.get('tags', ''))
        d['tags_index'] = normalize_tags(tags)

        d['title_index'] = normalize(d.get('title', self.get('title', '')))

        text_index = []
        for a in d.get('apps', []):
            if( a.get('type') in ['hive.html', 'hive.text']
                and a.get('content', '').strip()
            ):
                text = html.fromstring( a.get('content') ).text_content()
                text_index.extend( normalize(text) )
        text_index = list( set( d['tags_index'] + d['title_index'] +
            text_index ) )
        if text_index: d['text_index'] = text_index

    def _collect_files(self, d, old=True, thumb=True, background=True,
        apps=True
    ):
        ids = []
        if old: ids += self.get('file_id', [])

        apps = list(d.get('apps',[]))
        bg = d.get('background')
        if bg: apps.append(bg)
        for a in apps:
            f_id = a.get('file_id')
            if(f_id): ids.append(f_id)
            ids.extend( self._match_id(a.get('content')) )
            ids.extend( self._match_id(a.get('url')) )

        ids = filter(
            lambda f_id: self.db.File.fetch(f_id, fields={'fields':'_id'})
            ,list( set(ids) )
        )
        ids.sort()
        d['file_id'] = ids
        return ids

    def _match_id(self, s):
        if not isinstance(s, basestring): return []
        return map(lambda m: m[0], re.findall(r'/\b([0-9a-f]{24})(\b|_)', s))

    def create(self):
        assert map(self.has_key, ['owner', 'domain', 'name'])
        self['owner_name'] = self.db.User.fetch(self['owner'])['name']
        self['random'] = random.random()
        self['views'] = 0
        self.setdefault('title', 'Untitled')
        self.setdefault('auth', 'public')
        self._collect_files(self)
        self.build_search(self)
        super(Expr, self).create()
        if 'remixed' not in self.get('tags_index', []):
            feed = self.db.NewExpr.create(self.owner, self)
        else:
            remixed_expr = self.db.Expr.fetch(self['remix_parent_id'])
            feed = self.db.Remix.create(self.owner, remixed_expr, 
                data={'new_expr':self})

        self.update_owner([])
        return self

    def delete(self):
        for r in self.db.Feed.search({'entity': self.id}): r.delete()

        res = super(Expr, self).delete()

        old_tags = self.get('tags_index', [])
        self['tags_index'] = []
        self.update_owner(old_tags)

        return res

    def increment_counter(self, counter):
        assert counter in self.counters, "Invalid counter variable.  Allowed counters are " + str(self.counters)
        return self.increment({counter: 1})

    @property
    def views(self): return self.get('views', 0)

    def mini_view(self):
        mini = dfilter( self, ['name', 'owner_name'] )
        mini['id'] = self['_id']
        mini['snapshot_tiny'] = (self.snapshot_name('tiny')
            if self.snapshot_name('tiny') else
            self.db.assets.url('skin/site/expr_placeholder_tiny.jpg'))
        return mini

    def qualified_url(self):
        return "http://" + self['domain'] + "/" + self['name']

    def get_count(self, name):
        return self.get('analytics', {}).get('count', 0)

    def analytic_count(self, string):
        if string in ['facebook', 'gplus', 'twitter', 'stumble']:
            count = 0
            updated = 0
        try:
            updated = self['analytics'][string]['updated']
            count = self['analytics'][string]['count']  #return the value from the db if newer than 10 hours
        except: pass # (KeyError, TypeError):

        age = now() - updated
        if not (age < 36000 or (string == 'stumble' and age < 1)):
            try:
                count = getattr(social_stats, string + "_count")(self.qualified_url())
                subdocument = 'analytics.' + string
                self._col.update({'_id': self.id}, {'$set': {subdocument + '.count': count, subdocument + '.updated': now()}})
            except: pass

        return count
        if string in ['email']:
            try:
                return self['analytics'][string]['count']
            except (KeyError, TypeError):
                return 0

        else:
            return 0

    def get_url(self, relative=False, secure=False):
        base = '/' if relative else abs_url(secure=secure)
        return base + self['owner_name'] + '/' + self['name']
    url = property(get_url)

    @property
    def owner_url(self): return abs_url() + self.get('owner_name') + '/profile'

    def get_thumb(self, size=190):
        if self.get('thumb_file_id'):
            file = self.db.File.fetch(self['thumb_file_id'])
            if file:
                thumb = file.get_thumb(size,size)
                if thumb: return thumb
        return self.get('thumb')
    thumb = property(get_thumb)

    def set_tld(self, domain):
        """ Sets the top level domain (everything following first dot) in domain attribute """
        return self.update(updated=False, domain=re.sub(r'([^.]+\.[^.]+)$', domain, self['domain']))

    def get_comments(self):
        comments = self.db.Comment.search({'entity': self.id})
        try:
            comments_accurate = len(comments) == self['analytics']['Comment']['count']
        except KeyError:
            comments_accurate = False
        if not comments_accurate:
            self.update_cmd({'$set': {'analytics.Comment.count': len(comments)}})
        return comments
    comments = property(get_comments)

    def feed_page(self, viewer=None, **opts):
        if self.get('auth') == 'password' and self.get('password'):
            # TODO: add support for password matching
            if self.owner.id != get_id(viewer): return []

        items = self.db.Feed.page({ 'entity': self.id,
            'class_name': {'$in': ['Star', 'Comment', 'Broadcast', 'Remix']} }, **opts)

        return items

    @property
    def comment_count(self):
        try:
            return self['analytics']['Comment']['count']
        except KeyError:
            return 0

    def get_share_count(self):
        count = 0
        for item in ["email", "gplus", "twitter", "facebook"]:
            count += self.analytic_count(item)
        return count
    share_count = property(get_share_count)

    @property
    def is_featured(self):
        return self.id in self.db.User.get_root()['tagged'].get('Featured', [])

    @property
    def auth(self):
        return self.get('auth', 'password')

    public = property(lambda self: self.get('auth') == "public")

    def client_view(self, mode='card', viewer=None, special={}, activity=0):
        """ data for expr card, seen in community pages """
        if mode == 'page':
            return self.client_view_page()

        counts = dict([ ( k, v.get('count', 0) ) for
            k, v in self.get('analytics', {}).iteritems() ])
        counts['Views'] = self.views
        counts['Comment'] = self.comment_count
        expr = dfilter(self, ['name', 'title', 'feed', 'created',
            'updated', 'password', 'container'])
        expr['type'] = "expr"
        dict.update(expr, {
            'tags': self.get('tags_index'),
            'id': self.id,
            'thumb': self.get_thumb(),
            'owner': self.owner.client_view(viewer=viewer),
            'counts': counts,
            'url': self.url,
            'title': self.get('title')
        })
        if self.get('remix_root'):
            remix_root = self.db.Expr.fetch(self.get('remix_root'))
            if remix_root:
                dict.update(expr, { 'remix_root_owner': remix_root.owner['name'],
                    'remix_root_tag': 're:' + (remix_root.get('remix_name') 
                        or remix_root['name']) })
        if self.auth != 'public':
            expr.update({'auth': self.auth})
        expr['snapshot_big'] = self.snapshot_name("big")
        expr['snapshot_small'] = self.snapshot_name("small")
        if viewer and viewer.is_admin:
            dict.update(expr, { 'featured': self.is_featured })

        if activity > 0:
            # bugbug: we will want to limit the initial download to client (and paginate)
            # bugbug: we should only send the client the data it needs, namely, the icons
            dict.update( expr, comments = self.comment_feed() )
            dict.update( expr, loves = self.loves_feed() )
            dict.update( expr, broadcast = self.broadcast_feed() )
            # TODO: do we want client view to also include remix family?
            dict.update( expr, activity = self.activity_feed(None, activity) )
            # dict.update( expr, activity =
            #     map(lambda r: r.client_view(),
            #         self.db.Feed.search({'entity':self.id})) [0:activity] )
        return expr

    def client_view_page(self):
        """ data for expr page """
        expr = dfilter(self, ['layout_coord', 'clip_x', 'clip_y'])
        expr['type'] = "expr"
        apps = expr['apps'] = {}
        expr['bg'] = self.get('background')
        for app in self.get('apps',[]):
            app_id = app.get('id', 'app_' + str(app['z']))
            data = app.get('client_data', {})
            media = app.get('media')
            if media:
                data.update(media=media)
            if app['type'] == 'hive.code':
                data.update(dfilter(app, ['content', 'url']))
            if app['type'] == 'hive.image':
                data.update(dfilter(app, ['url']))
            if data:
                data['type'] = app['type']
                apps[app_id] = data
        return expr

    def loves_feed(self, count=-1, at=0):
        return self.activity_feed('Star', count, at)
    def broadcast_feed(self, count=-1, at=0):
        return self.activity_feed('Broadcast', count, at)
    def comment_feed(self, count=-1, at=0):
        return self.activity_feed('Comment', count, at)
    def activity_feed(self, feed_type=None, count=-1, at=0):
        search = {'entity':self.id}
        if feed_type:
            search.update({'class_name':feed_type})
        end = None if (count == -1) else at + count
        return map(lambda r: r.client_view(),
            self.db.Feed.search(search)) [at:end]

    @property
    def tag_string(self):
        return ' '.join(["#" + tag for tag in self.get('tags_index', [])])

    @property
    def private(self):
        return self['auth'] != 'public'


def generate_thumb(file, size, format=None):
    # resize and crop image to size tuple, preserving aspect ratio

    file.seek(0)
    imo = Img.open(file)
    if not format:
        format = imo.format
    #print "Thumbnail Generation:   initial size: " + str(imo.size),
    t0 = time.time()
    imo = ImageOps.fit(imo, size=size, method=Img.ANTIALIAS, centering=(0.5, 0.5))
    if imo.mode != 'RGB':
        bg = Img.new("RGBA", imo.size, (255,255,255))
        imo = imo.convert(mode='RGBA')
        imo = Img.composite(imo, bg, imo)
    dt = time.time() - t0
    #print "   final size:   " + str(imo.size),
    #print "   conversion took " + str(dt*1000) + " ms"

    output = os.tmpfile()
    imo.save(output, format=format, quality=90)
    return output


@register
class File(Entity):
    cname = 'file'
    _file = None #temporary fd

    IMAGE, UNKNOWN = range(2)

    def __init__(self, *a, **b):
        super(File, self).__init__(*a, **b)
        self._file = self.get('tmp_file')
        if self.has_key('tmp_file'): del self['tmp_file']

    def __del__(self):
        if( isinstance(self._file, file)
            and (not self._file.closed) ): self._file.close()

    @property
    def file(self):
        if not self._file:
            download = self.download()
            if not self._file:
                return False
        self._file.seek(0)
        return self._file

    def download(self):
        url = self.url
        if url.startswith("//"):
            url = "http:" + url
        try: response = urllib.urlopen(url)
        except:
            print 'urlopen fail for ' + self.id + ': ' + json.dumps(self.url)
            return False
        if response.getcode() != 200:
            print 'http fail ' + str(response.getcode()) + ': ' + self.url
            return False
        self._file = os.tmpfile()
        self._file.write(response.read())
        return True

    @property
    def media_type(self):
        if self['mime'] in ['image/jpeg', 'image/png', 'image/gif']:
            return self.IMAGE
        return self.UNKNOWN

    def set_resamples(self):
        imo = Img.open(self.file)
        # format = imo.format
        size = imo.size
        self.update(dimensions=size)
        factor = 2 ** .5
        ext = '.' + self.get('mime').split('/')[1]
        resample_fd, resample_filename = mkstemp(suffix=ext)
        os.write(resample_fd, self.file.read())
        os.close(resample_fd)

        # remove resamples for gifs with offset animation frames,
        # because imagemagick fails to resample them
        ident = os.tmpfile()
        call (['identify', resample_filename], stdout=ident)
        ident.seek(0)
        ident_frames = ident.read().strip().split("\n")
        # IIRC, this prevents animated gifs with any offsets from being resampled
        if len([x for x in ident_frames if not re.search(r'\+0\+0',x)]) > 0:
            self.update(resamples=[])
            return False

        resamples = []
        while (size[0] >= 100) or (size[0] >= 100):
            size = (size[0] / factor, size[1] / factor)
            size_rounded = (int(size[0] + .5), int(size[1] + .5))
            size_str = str(size_rounded[0]) + 'x' + str(size_rounded[1])
            cmd = ['mogrify', '-resize', size_str, resample_filename]
            call(cmd)
            resamples.append(size_rounded)
            self.db.s3.upload_file(resample_filename, 'media',
                self._resample_name(size_rounded[0]), 
                self._resample_name(size_rounded[0]),
                self['mime'])
        os.remove(resample_filename)
        resamples.reverse()
        self.update(resamples=resamples)

    def get_resample(self, w=None, h=None):
        resamples = self.get('resamples', []) or []
        for size in resamples:
            if (w and size[0] > w) or (h and size[1] > h):
                return self.url + '_' + str(int(size[0]))
                # This was necessary when media assets were on 5 buckets
                # but resamples were only on one.
                # return ( self.db.s3.bucket_url('media') + self.id + '_' +
                #     str(int(size[0])) )
        return self.url

    def _resample_name(self, w):
        return self.id + '_' + str(int(w))
    @property
    def _resample_names(self):
        return [self._resample_name(s[0]) for s in self.get('resamples', [])]

    def set_thumb(self, w, h, file=False, mime='image/jpeg', autogen=True):
        name = str(w) + 'x' + str(h)
        thumbs = self.get('thumbs', {})
        if thumbs.get(name): return False

        if not file: file = self.file
        if autogen:
            thumb_file = generate_thumb(file, (w,h), format='jpeg')
        else:
            thumb_file = file
        url = self.db.s3.upload_file(thumb_file, 'media', self._thumb_name(w, h),
            self['name'] + '_' + name, mime)

        thumbs[name] = True
        self.update(thumbs=thumbs)
        return thumb_file

    def _thumb_name(self, w, h):
        return self.id + '_' + str(w) + 'x' + str(h)

    def get_thumb(self, w, h):
        name = str(w) + 'x' + str(h)
        if not self.get('thumbs', {}).get(name): return False
        url = self.url
        if not url: return False
        return url + '_' + name

    def get_default_thumb(self):
        return self.get_thumb(190,190)
    default_thumb = property(get_default_thumb)

    @property
    def _thumb_keys(self):
        return [ self.id + '_' + n for n in self.get('thumbs', {}) ]

    def store(self):
        if self.db.config.aws_id:
            self.update(protocol='s3',
                s3_bucket=self.db.s3.buckets['media'].name,
                url=self.db.s3.upload_file(self.file, 'media', self.id,
                    self['name'], self['mime'])
            )
        else:
            self['protocol'] = 'file'
            owner = self.db.User.fetch(self['owner'])
            self['fs_path'] = media_path(owner)
            with open(joinpath(self['fs_path'], id), 'w') as f: f.write(file.read())
            return abs_url() + 'file/' + owner['name'] + '/' + name

    @property
    def url(self):
        return self.db.s3.url('media', self.id,
            bucket_name=self.get('s3_bucket'))

    def create_existing(self):
        super(File, self).create()

    def create(self):
        """ Uploads file to s3 if config.aws_id is defined, otherwise
        saves in config.media_path
        """
        self['owner']

        # # Image optimization
        # if self.media_type == self.IMAGE:
        #     self._file.seek(0)
        #     imo = Img.open(self._file)
        #     #except:
        #     #    res.delete()
        #     #    return False
        #     updated = False
        #     if imo.size[0] > 1600 or imo.size[1] > 1000:
        #         ratio = float(imo.size[0]) / imo.size[1]
        #         new_size = (1600, int(1600 / ratio)) if ratio > 1.6 else (int(1000 * ratio), 1000)
        #         imo = imo.resize(new_size, resample=Img.ANTIALIAS)
        #         updated = True
        #     opts = {}
        #     mime = self['mime']
        #     if mime == 'image/jpeg': opts.update(quality = 70, format = 'JPEG')
        #     if mime == 'image/png': opts.update(optimize = True, format = 'PNG')
        #     if mime == 'image/gif' and updated: opts.update(format = 'GIF')
        #     if opts:
        #         newfile = os.tmpfile()
        #         imo.save(newfile, **opts)
        #         self._file.close()
        #         self._file = newfile

        self._file.seek(0); self['md5'] = md5(self._file.read()).hexdigest()
        self['size'] = os.fstat(self._file.fileno()).st_size
        super(File, self).create()
        self.store()
        return self

    # download file from source and reupload
    def reset_file(self, file=None):
        self.pop('s3_bucket', None)
        self.pop('fs_path', None)
        if file: self._file = file
        self.store()

    def purge(self):
        self.delete_files()
        super(File, self).purge()

    def delete_files(self):
        for k in self._thumb_keys + [self.id] + self._resample_names:
            if self.get('s3_bucket'):
                try:
                    self.db.s3.delete_file(self['s3_bucket'], self.id)
                except:
                    # not critical if S3 remove fails, as will happen
                    # when dev tries to remove live files
                    # (it can always be cleaned up later)
                    # TODO: log error
                    pass
            elif self.get('fs_path'):
                try: os.remove(self['fs_path'])
                except:
                    print 'can not delete missing file: ' + self['fs_path']

    def client_view(self, viewer=None, activity=0):
        r = dfilter(self, ['name', 'mime', 'owner', 'thumbs'])
        r['type'] = "file"
        dict.update(r, id=self.id, url=self.url,
            thumb_big=self.get_thumb(222,222),
            thumb_small=self.get_thumb(70,70))
        return r

@register
class ActionLog(Entity):
    indexes = ['created', 'user']
    cname = 'action_log'

    class Collection(Collection):
        def create(self, user, action, data={}):
            data.update({
                'user': user.id
                ,'user_name': user.get('name')
                ,'action': action
                })
            return super(ActionLog.Collection, self).create(data)


@register
class MailLog(Entity):
    indexes = ['initiator', 'recipient', 'category', 'created']
    cname = 'mail_log'


@register
class Unsubscribes(Entity):
    indexes = ['email']
    cname = 'unsubscribes'


@register
class Feed(Entity):
    cname = 'feed'
    # TODO-perf: add { background: true } to all indexes by making this default
    # in Database constructor. Can't do now, because it would break
    # for every index that's not currently set.
    # Note currently safe also has to be set, to match indexes created
    # by compose.io index UI, but is not actually wanted at all
    #indexes = [ ( ('created', 1), {'background': True, 'safe': True} ), ['entity', ('created', -1)], ['initiator', ('created', -1)], ['entity_owner', ('created', -1)] ]
    # removing created_1 / created_-1 index because I keep having to
    # change it due to gremlin
    indexes = [
        ['entity', ('created', -1)],
        ['initiator', ('created', -1)],
        ['entity_owner', ('created', -1)]
    ]
    _initiator = _entity = None

    class Collection(Collection):
        def new(self, d):
            # override new only in this generic Feed class to return the specific subtype
            if self.entity == Feed: return getattr(self.db, d['class_name']).entity(self, d)
            else: return self.entity(self, d)

        def create(self, initiator, entity, data={}):
            data.update({
                'initiator': initiator.id
                ,'initiator_name': initiator.get('name')
                ,'entity': entity.id
                ,'entity_class': entity.__class__.__name__
                ,'entity_owner': entity.owner.id
                })
            return super(Feed.Collection, self).create(data)

        def search(self, spec, **opts):
            if not self.entity == Feed: spec.update(class_name=self.entity.__name__)
            return super(Feed.Collection, self).search(spec, **opts)

        def find(self, spec, **opts):
            if not self.entity == Feed: spec.update(class_name=self.entity.__name__)
            return super(Feed.Collection, self).find(spec, **opts)

    def create(self):
        for key in ['initiator', 'entity', 'entity_class']:
            assert self.has_key(key)

        #TODO: consult with user.prefs.email object to determine this value
        self['send_email'] = True

        class_name = type(self).__name__
        self.update(class_name=class_name)
        super(Feed, self).create()

        self.entity.update_cmd({'$inc': {'analytics.' + class_name + '.count': 1}})
        if (self["entity_class"] == 'Expr' and self["class_name"] == 'Star' and
            self.entity.owner['analytics'].get('loves_by')):
                self.entity.owner.increment({'analytics.loves_by': 1})

        if self.entity.owner.id != self['initiator']: self.entity.owner.notify(self)

        # Send any related notifications
        self.db.Searches.run_for(self)

        return self

    def delete(self):
        class_name = type(self).__name__
        if self.entity:
            self.entity.update_cmd({'$inc': {'analytics.' + class_name + '.count': -1}})
            if (self["entity_class"] == 'Expr' and self["class_name"] == 'Star' and
                self.entity.owner['analytics'].get('loves_by')):
                    self.entity.owner.increment({'analytics.loves_by': -1})
        super(Feed, self).delete()

    # TODO: replace all properties which have db queries with methods.
    @property
    def entity(self):
        if not self._entity:
            self._entity = getattr(self.db, self['entity_class']).fetch(self['entity'])
        return self._entity

    @property
    def initiator(self):
        if not self._initiator:
            self._initiator = self.db.User.fetch(self['initiator'])
        return self._initiator

    @property
    def owner_name(self):
        if self['entity_class'] == "User":
            return self.entity.get('name')
        elif self['entity_class'] == "Expr":
            return self.entity.get('owner_name')

    @property
    def owner_url(self):
        if self['entity_class'] == "User":
            return self.entity.url
        elif self['entity_class'] == "Expr":
            return self.entity.owner_url

    def viewable(self, viewer):
        return True

    def client_view(self):
        r = self.collection.new(self)
        r['type'] = "feed"
        # TODO: no good way to assert on broken db
        if self.initiator == None:
            return r
        if self.entity == None:
            return r
        r['initiator_thumb_small'] = (self.initiator.get_thumb(70) or
            self.db.assets.url('skin/site/user_placeholder_small.jpg'))
        if self['entity_class'] == 'User':
            r['entity_title'] = self.entity['name']
        elif self['entity_class'] == 'Expr':
            r['entity_title'] = self.entity.get('title')
        r['entity_url'] = self.entity.url
        r['owner_name'] = self.owner_name
        r['entity_name'] = self.entity.get('name')

        # set sane name for feed action
        r['action'] = self['class_name']
        if self['class_name'] == 'Star':
            if self['entity_class'] == 'Expr': r['action'] = 'Love'
            else: r['action'] = 'Follow'
        elif self['class_name'] == 'Broadcast':
            r['action'] = 'Republish'
        elif self['class_name'] == 'Remix':
            r['action'] = 'Remix'
            if r.get('entity_other_id'):
                new_expr = self.db.Expr.fetch(r['entity_other_id'])
                if new_expr:
                    r['other_owner_name'] = new_expr.owner['name']
                    r['other_entity_name'] = new_expr['name']
                    r['entity_url'] = new_expr.url

        return r


@register
class Comment(Feed):
    action_name = 'commented'

    def create(self):
        assert self.has_key('text')
        return super(Comment, self).create()

    @property
    def author(self): return self.get('initiator_name')

    def to_json(self):
        return {
            'text': self.get('text')
            , 'author': self.author
            , 'created': self.get('created')
            , 'thumb': self.initiator.get('thumb')
            }

    def get_thumb(self):
        return self.initiator.thumb
    thumb = property(get_thumb)


@register
class Star(Feed):
    @property
    def action_name(self):
        return 'loves' if self['entity_class'] == 'Expr' else 'listening'

    # TODO: update analytics
    def create(self):
        if self['entity_class'] == 'User' and self.entity.owner.id == self['initiator']:
            raise "Excuse me, you mustn't listen to yourself. It is confusing."
        if self['initiator'] in self.entity.starrer_ids: return True
        return super(Star, self).create()

    # TODO: update analytics
    def delete(self):
        return super(Star, self).delete()


@register
class Broadcast(Feed):
    action_name = 'broadcast'

    def create(self):
        if self.entity['owner'] == self['initiator']:
            raise "You mustn't broadcast your own newhive"
        if not isinstance(self.entity, Expr): raise "You may only broadcast newhives"
        if self.db.Broadcast.find({ 'initiator': self['initiator'], 'entity': self['entity'] }): return True
        return super(Broadcast, self).create()

@register
class Remix(Feed):
    action_name = 'remix'

    def create(self):
        # if self.entity['owner'] == self['initiator']:
        #     raise "You mustn't remix your own expression"
        if not isinstance(self.entity, Expr): raise "You may only remix newhives"
        # if self.db.Remix.find({ 'initiator': self['initiator'], 'entity': self['entity'] }): return True
        new_expr = self.get('new_expr')
        if new_expr:
            self['entity_other_id'] = new_expr.id
            del self['new_expr']
        res = super(Remix, self).create()
        return res


@register
class InviteNote(Feed):
    action_name = 'gave invites'


@register
class NewExpr(Feed):
    action_name = 'created'


@register
class UpdatedExpr(Feed):
    action_name = 'updated'

    def create(self):
        # if there's another update to this expr within 24 hours, delete it
        prev = self.db.UpdatedExpr.last({ 'initiator': self['initiator'],
            'entity': self['entity'] })
        if prev and now() - prev['created'] < 86400: prev.delete()
        super(UpdatedExpr, self).create()
        return self


@register
class FriendJoined(Feed):
    def viewable(self, viewer):
        return self['entity'] == viewer.id

    def create(self):
        if self.db.FriendJoined.find({ 'initiator': self['initiator'],
            'entity': self['entity'] }
        ): return True
        return super(FriendJoined, self).create()


@register
class Referral(Entity):
    cname = 'referral'
    indexes = [ 'key', 'request_id', 'created' ]

    def create(self):
        self['key'] = junkstr(16)
        return super(Referral, self).create()

    @property
    def url(self):
        #url = abs_url(secure=True) + 'signup?key=' + self.get('key')
        #if self.get('to'): url += '&email=' + self['to']

        # skip "invited" page
        url = AbsUrl('home/signup')
        url.query.update({'key': self.get('key')})
        if self.get('to'): url.query.update({'email': self['to']})
        return url


@register
class Contact(Entity):
    cname = 'contact_log'
    indexes = ['created']


@register
class ErrorLog(Entity):
    cname = 'error_log'
    indexes = ['created', 'type']


@register
class Temp(Entity):
    cname = 'temp'


@register
class Broken(Entity):
    """ This collection is for records that would cause problems if they were
        in their original table """

    cname = 'broken'
    indexes = ['record.id','record.created','record.updated']

    class Collection(Collection):
        def create(self, collection_name, record):
            entity = {}
            entity['collection'] = collection_name
            entity['record'] = record
            return super(Broken.Collection, self).create(entity)

def collection_of(db, collection):
    try:
        return getattr(db, collection.title())
    except AttributeError, e:
        return None

# def search_trash(db, spec, collection):
#     spec = { 'record.' + k: v for k, v in spec }
#     spec.update({'collection': collection})
#     return db.Trash.search(spec)

@register
class Trash(Entity):
    """ This collection is for records that are deleted but should be restorable
        in their original table """

    cname = 'trash'
    indexes = ['record.id','record.created','record.updated']

    def undelete(self):
        collection = collection_of(self.db, self['collection'])

        if collection:
            entity = collection.create(self['record'])
            entity.undelete(self)
            self.purge()

    class Collection(Collection):
        trashable = False
        def create(self, collection_name, record):
            entity = {}
            entity['collection'] = collection_name
            entity['record'] = record
            return super(Trash.Collection, self).create(entity)

@register
class Searches(Entity):
    """ This collection contains searches which should be executed whenever
        the underlying data is updated """

    cname = 'searches'
    # TODO: update the db spec doc with this and trash and whatever else has
    # changed recently
    indexes = ['search', 'type']

    def add_action(self, action):
        self.setdefault('action', [])
        if action not in self['action']:
            self.update(action=self['action'] + [action])

    class Collection(Collection):
        def run_for(self, entity):
            col = entity._col
            notify_data = { 
                "message": entity.entity.get('name') or "[Untitled]"
                ,"title": 'Push Notification Sample' 
                ,"msgcnt": '3'
                ,"soundname": 'beep.wav'
            }
            # TODO-perf: Need to be able to sample the list by user or
            # similar to cut down possible search space
            for search in self.db.Searches.search({'type': col.name}):
                _search = search['search']
                spec = literal_eval(_search)
                spec['_id'] = entity.id
                if col.find(spec).count():
                    actions = search.get('action', [])
                    for action in actions:
                        act_type = action.get('type')
                        try:
                            if act_type == 'gcm_notify':
                                gcm.notify(action.get('reg_id'), notify_data)
                        except Exception:
                            # Should delete the broken ones
                            pass 

        def get(self, search, _type="feed"):
            _search = str(search)
            entity = self.db.Searches.find({'search': _search})
            if entity: return entity
            return self.create(search, _type=_type)

        def create(self, search, _type="feed", **args):
            """ Helper function for searches creation
            """
            entity = args
            # Mongo doesn't like some types of literals in dict's, 
            # so don't store it.
            # entity['_search'] = search
            # Stringify to make it indexable
            entity['search'] = str(search)
            # assert search == literal_eval(str(search))
            entity['type'] = _type
            return super(Searches.Collection, self).create(entity)


## utils

def mk_password(v):
    if not v:
        return ''
    salt = "$6$" + junkstr(8)
    return crypt(v.encode('UTF8'), salt)

def get_id(entity_or_id):
    return( entity_or_id if isinstance(entity_or_id, basestring)
        else entity_or_id.id )


## analytics utils

def tags_by_frequency(db, spec={}, collection=None, **args):
    if not collection:
        collection = db.Expr

    args.update(limit=int(args.get('limit', '1000')))
    res = collection.search(spec, **args)
    tags = Counter()
    for r in res:
        tags.update(r.get('tags_index', []))
    return tags.most_common(100)
Database.tags_by_frequency = tags_by_frequency
