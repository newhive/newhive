import newhive
import re, pymongo, bson.objectid, random, urllib, os, mimetypes, time, getpass, exceptions, json
import operator as op
from os.path import join as joinpath
from md5 import md5
from datetime import datetime
from lxml import html
from wsgiref.handlers import format_date_time
from newhive import social_stats
from itertools import ifilter, islice, imap
import PIL.Image as Img
from PIL import ImageOps
from bson.code import Code
from crypt import crypt
from oauth2client.client import OAuth2Credentials
from newhive.oauth import FacebookClient, FlowExchangeError, AccessTokenCredentialsError
import pyes
from collections import defaultdict
from snapshots import Snapshots

from s3 import S3Interface
from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key

from newhive.utils import *
from newhive.routes import reserved_words

import logging
logger = logging.getLogger(__name__)


class Database:
    entity_types = []  # list of entity classes

    @classmethod
    def register(cls, entity_cls):
        cls.entity_types.append(entity_cls)
        return entity_cls

    def add_collection(self, col):
        pass

    def __init__(self, config=None):
        config = self.config = (config if config else newhive.config)

        self.con = pymongo.Connection(host=config.database_host, port=config.database_port)
        self.mdb = self.con[config.database]
        self.s3 = S3Interface()

        self.collections = map(lambda entity_type: entity_type.Collection(self, entity_type), self.entity_types)
        for col in self.collections:
            setattr(self, col.entity.__name__, col)
            for index in col.entity.indexes:
                (key, opts) = index if type(index) == tuple and type(index[1]) == dict else (index, {})
                key = map(lambda a: a if type(a) == tuple else (a, 1), [key] if not isinstance(key, list) else key)
                col._col.ensure_index(key, **opts)

        # initialize elasticsearch index
        self.esdb = ESDatabase(self)

    def query(self, q, viewer=None, expr_only=None, fuzzy=False,
              es_order='_score,updated:desc', **args):
        args['viewer'] = viewer
        search = self.parse_query(q)

        spec = {}
        if search.get('auth'): spec['auth'] = (
            'public' if search['auth'] == 'public' else 'password')

        # todo: put auth specs into elasticsearch searches
        # todo: make sure that elasticsearch pagination resultsets are of the correct
        #       size after filtering out exprs that are not viewable
        # todo: return grouped_feed items with expressions in network trending
        # todo: handle all queries with esdb for compound queries like '#Loves #food'

        feed = search.get('feed')
        if feed:
            if feed == 'featured':
                results = self.Expr.page(self.User.root_user['tagged']['Featured'], **args)
            if feed == 'recent':
                results = self.Expr.page({}, **args)
            else:
                results = viewer.feed_page_esdb(spec=spec, feed=feed, **args)
        elif any(k in search for k in ('tags', 'phrases', 'text', 'user')):
            results = self.esdb.paginate(search, es_order=es_order, fuzzy=fuzzy,
                                         sort='score', viewer=viewer, **args)
        else:
            sort = 'updated'
            results = self.Expr.page(spec, **args)
            if not expr_only:
                results = results + self.User.page(spec, **args)
                results.sort(cmp=lambda x, y: cmp(x[sort], y[sort]), reverse=True)

        return results

    def parse_query(self, q):
        """ Parses search query into MongoDB spec
            #tag, @user, text, #SpecialCategory
        """

        # split into words with possible [@#] prefix, isolate phrases in quotes

        search = {'text': [], 'tags': [], 'phrases': [], 'feed': False }
        q_quotes = re.findall(r'"(.*?)"', q, flags=re.UNICODE)
        q_no_quotes = re.sub(r'"(.*?)"', '', q, flags=re.UNICODE)

        search['phrases'].extend(q_quotes)

        for pattern in re.findall(r'(\b|\W+)(\w+)', q_no_quotes):
            prefix = re.sub( r'[^#@]', '', pattern[0] )
            if prefix == '@': search['user'] = pattern[1].lower()
            elif prefix == '#':
                if pattern[1] == 'Public': search['auth'] = 'public'
                elif pattern[1] == 'Private': search['auth'] = 'password'
                elif pattern[1] in [
                    'Featured', 'Recent', 'Network', 'Trending',
                    'Activity', 'Followers', 'Following', 'Loves',
                ]:
                    search['feed'] = pattern[1].lower()
                else: search['tags'].append( pattern[1].lower() )
            else: search['text'].append( pattern[1].lower() )

        for k in ['text', 'tags', 'phrases']:
            if len(search[k]) == 0:
                del search[k]

        return search


class Collection(object):
    def __init__(self, db, entity):
        self.db = db
        self._col = db.mdb[entity.cname]
        self.entity = entity
        self.config = db.config

    def fetch_empty(self, key, keyname='_id'): return self.find_empty({ keyname : key })

    def fetch(self, key, keyname='_id', **opts):
        if type(key) == list:
            return list(self.search({'_id': {'$in': key }}))
        else:
            return self.find({ keyname : key }, **opts)

    def find_empty(self, spec, **opts):
        res = self.find(spec, **opts)
        return res if res else self.new({})

    def find(self, spec, **opts):
        r = self._col.find_one(spec, **opts)
        if not r: return None
        return self.new(r)

    def search(self, spec, **opts):
        if type(spec) == list:
            items = {}
            res = []
            for e in self.search({'_id': {'$in': spec }}):
                items[e.id] = e
            for i in spec:
                if items.has_key(i): res.append(items[i])
            return res
        return Cursor(self, self._col.find(spec=spec, **opts))

    # Should be overridden to ommit fields not used in list views
    def cards(self,  spec, **opts):
        return self.search(spec, **opts)

    def last(self, spec={}, **opts):
        opts.update({'sort' : [('_id', -1)]})
        return self.find(spec, **opts)

    def paginate(self, spec, limit=40, at=None, sort='updated', order=-1, filter=None):
        page_is_id = is_mongo_key(at)
        if at and not page_is_id:
            at = float(at)

        if type(spec) == dict:
            if page_is_id:
                page_start = self.fetch(at)
                at = page_start[sort] if page_start else None

            if at and sort: spec[sort] = { '$lt' if order == -1 else '$gt': at }
            res = self.cards(spec, sort=[(sort, order)])
            # if there's a limit, collapse to list, get sort value of last item
            if limit:
                if filter:
                    res = ifilter(filter, res)
                res = islice(res, limit)
                res = list(res)
            return res

        elif type(spec) == list:
            spec = uniq(spec)
            assert( not at or page_is_id )

            try:
                start = spec.index(at) if at else -1
                end = start + limit * -order
                if end > start:
                    if start >= len(spec): return []
                    sub_spec = spec[start+1:end+1]
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

            res = self.cards(sub_spec)
            return res

    # default implementation of pagination, intended to be overridden by
    # specific model classes
    # TODO: fix privacy for viewer
    def page(self, spec, viewer=None, sort='updated', **opts):
        return self.paginate(spec, **opts)

    def count(self, spec={}): return self.search(spec).count()

    # self.new can be overridden to return custom object types
    def new(self, doc): return self.entity(self, doc)

    def esdb_new(self, r):
        r['id'] = r.get_id()
        return self.entity(self, r)

    def create(self, doc):
        new_entity = self.new(doc)
        return new_entity.create()

    def map_reduce(self, *a, **b): return self._col.map_reduce(*a, **b)


class Cursor(object):
    def __init__(self, collection, cursor):
        self.collection = collection
        self._cur = cursor

        # wrap pymongo.cursor.Cursor methods. mongodb cursors allow chaining of
        # methods like sort and limit, however in this case rather than
        # returning a pymongo.cursor.Cursor instance we want to return a
        # newhive.state.Cursor instance, but for methods like count that return
        # an integer or some other value, just return that
        def mk_wrap(self, method):
            wrapped = getattr(self._cur, m)

            def wrap(*a, **b):
                rv = wrapped(*a, **b)
                if type(rv) == pymongo.cursor.Cursor: return self
                else: return rv
            return wrap

        for m in ['count', 'distinct', 'explain', 'sort', 'limit']:
            setattr(self, m, mk_wrap(self, m))

    def __len__(self): return self.count()

    def __getitem__(self, index): return self.collection.new(self._cur.__getitem__(index))

    def next(self): return self.collection.new(self._cur.next())

    def __iter__(self): return self


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
        self._col = collection._col
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

    def save(self, updated=True):
        if updated: self['updated'] = now()
        return self.update_cmd(self)

    def reload(self):
        dict.update(self, self.db.User.fetch(self.id))

    def update(self, **d):
        if not d.has_key('updated'): d['updated'] = now()
        elif not d['updated']: del d['updated']
        dict.update(self, d)
        return self._col.update({ '_id' : self.id }, { '$set' : d }, safe=True)

    def update_cmd(self, d, **opts): return self._col.update({ '_id' : self.id }, d, **opts)

    def increment(self, d):
        """Increment counter(s) identified by a dict.
        For example {'foo': 2, 'bar': -1, 'baz.qux': 10}"""
        return self.update_cmd({'$inc': d}, upsert=True)

    def flag(self, name):
        return self.update_cmd({'$set': {'flags.' + name: True}})

    def unflag(self, name):
        return self.update_cmd({'$set': {'flags.' + name: False}})

    def flagged(self, name):
        if self.has_key('flags'):
            return self['flags'].get(name, False)
        else:
            return False

    def delete(self): return self._col.remove(spec_or_id=self.id, safe=True)

# Common code between User and Expr
class HasSocial(Entity):
    @property
    @cached
    def starrer_ids(self):
        return [i['initiator'] for i in self.db.Star.search({ 'entity': self.id }) ]

    @property
    def star_count(self): return len(self.starrer_ids)

    def starrer_page(self, **args): return self.db.User.page(self.starrer_ids, **args)

    def stars(self, spec={}):
        """ Feed records indicating who is listening to or likes this entity """
        spec.update({'entity': self.id })
        return self.db.Star.search(spec)

    @property
    @cached
    def broadcast_count(self):
        return self.db.Broadcast.search({ 'entity': self.id }).count()


@Database.register
class User(HasSocial):
    cname = 'user'
    indexes = [
        ('updated', -1),
        ('name', {'unique': True}),
        ('sites', {'unique': True}),
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
            return self.find({'facebook.id': id, 'facebook.disconnected': {'$exists': False}})

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
        doc = dict(owner = self.id, name = '', domain = self['sites'][0])
        doc.update(d)
        return self.db.Expr.create(doc)

    def create(self):
        self['name'] = self['name'].lower()
        # self['signup_group'] = self.collection.config.signup_group
        assert re.match('[a-z][a-z0-9]{2,23}$', self['name']) != None, 'Invalid username'
        assert not (self['name'] in reserved_words) 
        self.set_password(self['password'])
        self['fullname'] = self.get('fullname', self['name'])
        self['referrals'] = 0
        self['flags'] = {}
        # self['email_subscriptions'] = self.collection.config.default_email_subscriptions
        assert self.has_key('referrer')
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
        self.increment({'notification_count': 1})

    @property
    @cached
    def my_stars(self):
        """ Feed records indicating what expressions a user likes and who they're listening to """
        return list(self.db.Star.search({ 'initiator': self.id }, sort=[('created', -1)]))

    @property
    @cached
    def starred_user_ids(self):
        return [i['entity'] for i in self.my_stars if i['entity_class'] == 'User']

    @property
    def starred_expr_ids(self):
        return [i['entity'] for i in self.my_stars if i['entity_class'] == 'Expr']

    def starred_user_page(self, **args): return self.collection.page(self.starred_user_ids, **args)

    @property
    @cached
    def broadcast(self): return self.db.Broadcast.search({ 'initiator': self.id })

    @property
    def broadcast_ids(self): return [i['entity'] for i in self.broadcast]

    def can_view(self, expr):
        return expr and ((expr.get('auth', 'public') == 'public') or
                         (self.id == expr['owner']) or
                         (expr.id in self.starred_expr_ids))

    def can_view_filter(self):
        """Creates an elasticsearch filter corresponding to can_view"""
        f = [pub_filter, pyes.filters.TermFilter('owner', self.id)]
        if len(self.starred_expr_ids)>0:
            f.append(pyes.filters.IdsFilter(self.starred_expr_ids))
        return pyes.filters.BoolFilter(should=f)

    def activity(self, limit=20, at=0):
        if not self.id: return []
        commented_exprs = [r['entity'] for r in self.db.Comment.search({'initiator': self.id})]
        q1 = pyes.query.TermQuery('class_name', 'Comment')
        q2 = pyes.query.TermQuery('initiator', self.id)
        q3 = pyes.query.TermQuery('entity_owner', self.id)
        q4 = pyes.query.TermsQuery('entity', commented_exprs)
        q5 =pyes.query.BoolQuery(must = [q4, q1])
        q = pyes.query.BoolQuery(should = [q2, q3, q5])  # boolean OR query
        return map(self.db.Feed.esdb_new, self.db.esdb.conn.search(
            q, indices=self.db.esdb.index, doc_types='feed-type',
            size=limit, start=at, sort='created:desc'))

        # return db.Feed.search({'$or': [
        #     {'entity_owner': u.id},
        #     {'initiator': u.id},
        #     {'entity': {'$in': commented_exprs}, 'class_name': 'Comment'}
        # ]}, **args)

    def feed_profile_entities(self, **args):
        res = self.feed_profile(**args)
        for i, item in enumerate(res):
            if item.type == 'FriendJoined': continue
            entity = item.initiator if item.entity.id == self.id else item.entity
            entity['feed'] = [item]
            res[i] = entity
        return res

    def feed_page_esdb(self, at=0, limit=40, feed=False, **opts):
        f_user_class_name = pyes.filters.TermsFilter('class_name', ['NewExpr', 'Broadcast', 'Star'])
        f_user_initiator = pyes.filters.TermsFilter('initiator', self.starred_user_ids)
        f_user = pyes.filters.BoolFilter(must=[f_user_initiator, f_user_class_name])

        f_expr_class_name = pyes.filters.TermsFilter('class_name', ['UpdatedExpr', 'Comment'])
        f_expr_entity = pyes.filters.TermsFilter('entity', self.starred_expr_ids)
        f_expr_initiator = pyes.filters.TermFilter('initiator', self.id)
        f_expr = pyes.filters.BoolFilter(must=[f_expr_class_name, f_expr_entity], must_not=[f_expr_initiator])

        f = pyes.filters.BoolFilter(should=[f_user, f_expr])
        fq = pyes.query.FilteredQuery(match_all_query, f)

        total_limit = 20*limit
        # since there may be many feed items for the same expression
        # note that with the current pagination, the maximum number of
        # retrievable feed items is total_limit

        res_feed = self.db.esdb.conn.search(fq, indices=self.db.esdb.index,
                                            doc_types="feed-type",
                                            sort="created:desc")

        feed_with_expr = defaultdict(list)  # lists of which feed items go with each expr

        if feed == 'trending':
            for r in res_feed[:total_limit]:
                feed_with_expr[r['entity']].append(r._meta.id)
            expr_ids = feed_with_expr.keys()

            qid = pyes.query.IdsQuery(expr_ids)
            f = self.can_view_filter()
            query = pyes.query.FilteredQuery(qid, f)
            custom_query = pyes.query.CustomScoreQuery(query,
                                                       script=popularity_time_score)
            res = self.db.esdb.conn.search(custom_query, indices=self.db.esdb.index,
                                           doc_types="expr-type", start=at,
                                           sort="_score,created:desc", size=limit)
            items = self.db.esdb.esdb_paginate(res, es_type='expr-type')
        else:
            items = []
            for r in res_feed[at:]:
                feed_with_expr[r['entity']].append(r._meta.id)
                if len(feed_with_expr[r['entity']]) == 1:
                    expr = self.db.Expr.fetch(r['entity'])
                    if expr is not None and self.can_view(expr):
                        items.append(expr)
                if len(items) == limit: break
        return items #, {i: feed_with_expr[i] for i in [ii['_id'] for ii in items]}

    # TODO: move this into ESDB for searching within your network
    def feed_network(self, spec={}, limit=40, at=None, **args):
        user_action = {
                'initiator': {'$in': self.starred_user_ids},
                'class_name': {'$in': ['NewExpr', 'Broadcast']}
                }
        own_broadcast = { 'initiator': self.id, 'class_name': 'Broadcast' }
        expression_action = {
                'entity': {'$in': self.starred_expr_ids}
                , 'class_name': {'$in':['Comment', 'UpdatedExpr']}
                , 'initiator': { '$ne': self.id }
                }
        or_clause = [user_action, own_broadcast, expression_action]

        # In some cases we have an expression but no feed item to page relative
        # to.  In this case, look up the most recent appropriate feed item with
        # that expression as entity
        if is_mongo_key(at):
            feed_start = list( self.feed_search({'entity': at, '$or': or_clause },
                    viewer=args['viewer'], limit=1) )
            if len( feed_start ): at = feed_start[0]['created']
            else: at = None

        # produces an iterable for all network feed items
        res = self.feed_search({ '$or': or_clause }, auth='public', at=at, **args)
        # groups feed items by ther expressions (entity attribute), and applies page limit
        results = self.feed_group(res, limit, spec=spec)
        return results

    # wrapper around db.query('#Trending') to add recent feed items
    def feed_trending(self, **paging_args):
        self.db.query('#Trending') 

    def feed_search(self, spec, viewer=None, auth=None, limit=None, **args):
        if type(viewer) != User: viewer = self.db.User.fetch_empty(viewer)
        res = self.db.Feed.paginate(spec, limit=0, sort='created', **args)
        if auth: res = ifilter(lambda i: i.entity and i.entity.get('auth', auth) == auth, res)
        res = ifilter(lambda i: i.viewable(viewer) and viewer.can_view(i.entity), res)
        if limit: res = islice(res, limit)
        return res

    def feed_group(self, res, limit, spec={}, feed_limit=6):
        """" group feed items by expression """
        exprs = []
        filter = True if spec.items() else False
        for item in res:
            if filter:
                spec['_id'] = item['entity']
                if not self.db.Expr.search(spec).count(): continue
            i = index_of(exprs, lambda e: e.id == item['entity'])
            if i == -1:
                item.entity['feed'] = [item]
                exprs.append(item.entity)
            elif len(exprs[i]['feed']) < feed_limit:
                if index_of(exprs[i]['feed'], lambda e: e['initiator'] == item['initiator']) != -1: continue
                exprs[i]['feed'].append(item)
            if len(exprs) == limit: break
        return exprs

    def build_search(self, d):
        d['text_index'] = normalize( self['name'] + ' ' + self.get('fullname', '') )

    def new_referral(self, d, decrement=True):
        if self.get('referrals', 0) > 0 or self == self.db.User.root_user or self == self.db.User.site_user:
            if decrement: self.increment({ 'referrals': -1 })
            d.update(user = self.id)
            return self.db.Referral.create(d)

    def give_invites(self, count):
        self.increment({'referrals':count})
        self.db.InviteNote.create(self.db.User.named(self.collection.config.site_user), self, data={'count':count})

    def cmp_password(self, v):
        if not isinstance(v, (str, unicode)): return False
        return crypt(v.encode('UTF8'), self['password']) == self['password']

    def set_password(self, v):
        salt = "$6$" + junkstr(8)
        self['password'] = crypt(v.encode('UTF8'), salt)

    def update_password(self, v):
        self.set_password(v)
        self.update(password=self['password'])

    def get_url(self, path='profile/', relative=False, secure=False):
        base = '/' if relative else abs_url(secure=secure)
        return base + self.get('name', '') + '/' + path
    url = property(get_url)

    @property
    def has_thumb(self):
        id = self.get('thumb_file_id')
        url = self.get('profile_thumb')
        return True if ( (id and id != '') or (url and url != '') ) else False

    def get_thumb(self, size=190):
        if self.get('thumb_file_id'):
            file = self.db.File.fetch(self['thumb_file_id'])
            if file:
                thumb = file.get_thumb(size,size)
                if thumb: return thumb
        return self.get('profile_thumb')
    thumb = property(get_thumb)

    def get_files(self):
        return self.db.File.search({ 'owner' : self.id })
    files = property(get_files)

    def set_expr_count(self):
        count = self.mdb.expr.find({"owner": self.id, "apps": {"$exists": True, "$not": {"$size": 0}}, "auth": "public"}).count()
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
        return bool(self.mdb.expr.find({'owner': self.id, 'apps': {'$exists': True}, 'name': ''}).count())
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

        if not self.has_key('oauth'): self['oauth'] = {}
        if profile:
            self['facebook'] = self.fb_client.me()
        self['oauth']['facebook'] = json.loads(credentials.to_json())
        self.save()

    @property
    def facebook_id(self):
        if self.has_key('facebook'): return self['facebook'].get('id')
        else: return False

    @property
    def fb_thumb(self):
        if self.has_key('facebook'):
            return "https://graph.facebook.com/" + self.facebook_id + "/picture?type=square"

    @property
    def fb_name(self):
        if self.has_key('facebook'):
            return self['facebook']['name']

    def facebook_disconnect(self):
        if self.facebook_credentials and not self.facebook_credentials.access_token_expired:
            fbc = FacebookClient()
            try:
                fbc.delete('https://graph.facebook.com/me/permissions', self.facebook_credentials)
            except (FlowExchangeError, AccessTokenCredentialsError) as e:
                print e
            self.facebook_credentials = None
        #self.update_cmd({'$set': {'facebook.disconnected': True}}) # WTF? this doesn't actually disconnect you
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
        return self.db.User.search({'facebook.id': {'$in': [str(friend['uid']) for friend in friends]}, 'facebook.disconnected': {'$exists': False}})

    def get_expressions(self, auth=None):
        spec = {'owner': self.id}
        if auth: spec.update(auth=auth)
        return self.db.Expr.search(spec)
    expressions = property(get_expressions)

    # TODO: cache db query
    def get_top_expressions(self, count=6):
        return self.get_expressions(auth='public').sort([('views', -1)]).limit(count)
    top_expressions = property(get_top_expressions)

    # TODO: cache db query
    def get_recent_expressions(self, count=6):
        return self.get_expressions(auth='public').sort([('updated', -1)]).limit(count)
    recent_expressions = property(get_recent_expressions)

    def client_view(self, viewer=None, activity=False):
        user = self.db.User.new( dfilter( self, ['fullname', 'profile_thumb', 'thumb_file_id',
            'name', 'tags', 'updated', 'created', 'feed'] ) )
        # TODO: make sure this field is updated wherever views changes elsewhere
        # TODO: figure out best thing to do for empty user
        # TODO: make new class for analytics.  
        #   Add tests to verify info survives new views, add/delete loves, users
        if self.has_key('analytics'):
            #if not self['analytics'].has_key('views_by'):
            self['analytics']['views_by'] = (
                sum([r['views'] for r in self.db.Expr.search({'owner':self['_id']})]))
            #if not self['analytics'].has_key('loves_by'):
            self['analytics']['loves_by'] = (
                self.db.Feed.search({'entity_owner':self['_id'], 
                    'class_name':'Star', 'entity_class': 'Expr'}).count())
            user.update()
            dict.update(user, dict(
                views_by = self['analytics']['views_by'],
                loves_by = self['analytics']['loves_by'],
                expressions = self.get_expr_count(), # Why expressions->count?  nothing else is in there.
                ))
        #exprs = self.get_top_expressions(3)
        exprs = self.db.Expr.cards({'owner': self.id}, limit=3)

        dict.update(user, dict(
            id = self.id,
            url = self.url,
            user_is_owner = bool(viewer and viewer['_id'] == self['_id']),
            mini_expressions = map(lambda e:e.mini_view(), exprs),
            thumb_70 = self.get_thumb(70),
            thumb_190 = self.get_thumb(190),
            has_thumb = self.has_thumb,
            logged_in = self.logged_in,
            notification_count = self.notification_count,
        ) )
        if viewer: dict.update(user, listening = self.id in viewer.starred_user_ids )
        if activity:
            dict.update( user, activity =
                map(lambda r: r.client_view(), self.activity()) )
        return user

    def delete(self):
        # Facebook Disconnect
        self.facebook_disconnect()

        # Feed Cleanup
        for feed_item in self.db.Feed.search({'$or': [{'initiator': self.id}, {'entity': self.id}]}):
            feed_item.delete()

        # Expressions Cleanup
        for e in self.expressions:
            e.delete()

        return super(User, self).delete()

    def has_group(self, group, level=None):
        groups = self.get('groups')
        if type(group) == list: return False
        if not groups or not group in groups:
            return False
        return level == None or level == groups[group]

    def add_group(self, group, level):
        assert type(group) == str and len(group) <=3
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
        return self.get('name') in self.collection.config.admins


@Database.register
class Session(Entity):
    cname = 'session'


def media_path(user, name=None):
    p = joinpath(self.config.media_path, user['name'])
    return joinpath(p, name) if name else p

@Database.register
class Expr(HasSocial):
    cname = 'expr'
    indexes = [
         (['owner_name', 'name'], {'unique':True})
        ,['owner', 'updated']
        ,'tags_index'
        ,'text_index'
        ,'updated'
        ,'random'
        ,'file_id'
    ]
    counters = ['owner_views', 'views', 'emails']
    _owner = None

    class Collection(Collection):
        def named(self, username, name): return self.find({'owner_name': username, 'name': name})

        def cards(self,  spec, **opts):
            opts.setdefault('fields', { 'apps': 0, 'background': 0,
                'text_index': 0, 'title_index': 0, 'file_id': 0, 'images': 0  })
            return self.search(spec, **opts)

        def fetch(self, key, keyname='_id', meta=False):
            fields = { 'text_index': 0, 'title_index': 0 }
            if meta: fields.update({ 'apps': 0, 'background': 0, 'file_id': 0, 'images': 0 })
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
            """ Convenience utility function not used in production, retrieve Expr from full URL """
            [(port, user, name)] = re.findall(self.config.server_name + r'/(:\d+)?(\w+)/(.*)$', url)
            return cls.named(user, name)

        def page(self, spec, viewer, auth='public', tag=None, sort='updated', **args):
            if tag: spec.update(tags_index=tag) # normalize tag input?

            if type(spec) == dict:
                spec.update(auth=auth)
                if auth == 'public':
                    spec.update(password={'$exists': False})

            assert(sort in ['updated', 'random'])
            args.update(sort=sort)
            rs = self.paginate(spec, filter=viewer.can_view, **args)

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
            
    def take_snapshots(self):
        snapshotter = Snapshots()
        snapshot_time = now()
        filename_base = '_'.join([self.get('_id'), snapshot_time])

        name = filename_base + '_715.png'
        snapshotter.take_snapshot(self.id, dimensions=(715, 430),
            out_filename=name)
        self.db.s3.upload_file(name, mimetype='image/png')

        name = filename_base + '_390.png'
        snapshotter.take_snapshot(self.id, dimensions=(390, 235),
            out_filename=name)
        self.db.s3.upload_file(name, mimetype='image/png')

        self['snapshot_time'] = snapshot_time
        self.save()

    @property
    def snapshot(self, size='715'):
        # Take new snapshot if necessary
        if not self.get('snapshot_time') or self.get('updated') > self.get('snapshot_time'):
            self.take_snapshots()
        filename = '_'.join([self.get('_id'), self.get('snapshot_time'), size])
        s3_url = 'https://%s.s3.amazonaws.com/%s' % (config.s3_buckets['thumb'], filename)
        return s3_url

    def related_next(self, spec={}, **kwargs):
        if type(spec) == dict:
            shared_spec = spec.copy()
            shared_spec.update({'auth': 'public', 'apps': {'$exists': True}})
        else: shared_spec = spec
        return super(Expr, self).related_next(shared_spec, **kwargs)

    def related_prev(self, spec={}, **kwargs):
        if type(spec) == dict:
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
        if not d.has_key('file_id'): self._collect_files(d)
        self.build_search(d)
        super(Expr, self).update(**d)
        self.owner.get_expr_count(force_update=True)
        return self

    def build_search(self, d):
        tags = d.get('tags')
        tag_list = []
        if tags: tag_list = d['tags_index'] = normalize_tags(tags)

        d['title_index'] = normalize( self.get('title', '') )

        text_index = []
        for a in d.get('apps', []):
            if a.get('type') in ['hive.html', 'hive.text'] and a.get('content', '').strip():
                text = html.fromstring( a.get('content') ).text_content()
                text_index.extend( normalize(text) )
        text_index = list( set( text_index + tag_list ) )
        if text_index: d['text_index'] = text_index

    def _collect_files(self, d, old=True, thumb=True, background=True, apps=True):
        ids = []
        if old: ids += self.get('file_id', [])
        if thumb: ids += ( [ d['thumb_file_id'] ] if d.get('thumb_file_id') else [] )
        if background: self._match_id(d.get('background', {}).get('url'))
        if apps:
            for a in d.get('apps', []):
                ids.extend( self._match_id( a.get('content') ) )
        ids = list( set( ids ) )
        ids.sort()
        d['file_id'] = ids
        return ids

    def _match_id(self, s):
        if not isinstance(s, (str, unicode)): return []
        return map(lambda m: m[0], re.findall(r'/([0-9a-f]{24})(\b|_)', s))

    def create(self):
        assert map(self.has_key, ['owner', 'domain', 'name'])
        self['owner_name'] = self.db.User.fetch(self['owner'])['name']
        self['domain'] = self['domain'].lower()
        self['random'] = random.random()
        self.setdefault('title', 'Untitled')
        self.setdefault('auth', 'public')
        self._collect_files(self)
        self.build_search(self)
        super(Expr, self).create()
        feed = self.db.NewExpr.create(self.owner, self)
        self.owner.get_expr_count(force_update=True)
        return self

    def delete(self):
        self.owner.get_expr_count(force_update=True)
        for r in db.Feed.search({'entity': self.id}): r.delete()
        return super(Expr, self).delete()

    def increment_counter(self, counter):
        assert counter in self.counters, "Invalid counter variable.  Allowed counters are " + str(self.counters)
        return self.increment({counter: 1})

    @property
    def views(self): return self.get('views', 0)

    def mini_view(self): 
        mini = dfilter( self, ['thumb', 'name', 'owner_name'] )
        mini['id'] = self['_id']
        return mini

    def qualified_url(self):
        return "http://" + self['domain'] + "/" + self['name']

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

    def cmp_password(self, v):
        password = self.get('password', '')
        if password == '': return True
        if not isinstance(v, (str, unicode)): v = ''
        return password == v
        # This implementation doesn't work for non-ascii text, we need to look
        # into this before enabling hashed expression passwords
        #if password == v: return True
        #return crypt(v.encode('UTF8'), password) == password

    def set_password(self, v):
        salt = "$6$" + junkstr(8)
        self['password'] = crypt(v.encode('UTF8'), salt)

    def update_password(self, v):
        self.set_password(v)
        upd = { 'password': self['password'], 'auth': 'password' if v else 'public' }
        self.update(**upd)

    def auth_required(self, user=None, password=None):
        if (self.get('auth') == 'password'):
            if self.cmp_password(password): return False
            if user and user.id == self.get('owner'): return False
            return True
        return False

    def get_url(self, relative=False, secure=False):
        base = '/' if relative else abs_url(secure=secure)
        return base + self['owner_name'] + '/' + self['name']
    url = property(get_url)

    @property
    def owner_url(self): return abs_url() + self.get('owner_name') + '/profile'

    def get_thumb(self, size=190):
        if self.get('thumb_file_id'):
            file =  self.db.File.fetch(self['thumb_file_id'])
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
            'class_name': {'$in': ['Star', 'Comment', 'Broadcast']} }, **opts)

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

    public = property(lambda self: self.get('auth') == "public")

    def client_view(self, viewer=None, activity=0):
        counts = dict([ ( k, v.get('count', 0) ) for
            k, v in self.get('analytics', {}).iteritems() ])
        counts['Views'] = self.views
        counts['Comment'] = self.comment_count
        # if expr.auth_required(viewer, password):
        expr = dfilter(self, ['name', 'title', 'snapshot', 'feed'])
        dict.update(expr, {
            'tags': self.get('tags_index'),
            'id': self.id,
            'thumb': self.get_thumb(),
            'owner': self.owner.client_view(viewer=viewer),
            'counts': counts,
            'url': self.url,
            'title': self.get('title')
        })
        # Until the migration happens, let's just put a placeholder image in the snapshot field
        # instead of starting the generation of snapshots inside of client_view.
        if self.get('snapshot_time'):
            expr['snapshot'] = self.snapshot
        else:
            expr['snapshot'] = 'snapshot_placeholder.png'
        if viewer and viewer.is_admin:
            dict.update(expr, { 'featured': self.is_featured })

        if activity > 0:
            dict.update( expr, activity =
                map(lambda r: r.client_view(), 
                    self.db.Feed.search({'entity':self.id})) [0:activity] )
        return expr

    @property
    def tag_string(self):
        return ' '.join(["#" + tag for tag in self.get('tags_index', [])])

def generate_thumb(file, size):
    # resize and crop image to size tuple, preserving aspect ratio, save over original
    file.seek(0)
    imo = Img.open(file)
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
    imo.save(output, format='jpeg', quality=70)
    return output


@Database.register
class File(Entity):
    cname = 'file'
    _file = None #temporary fd

    IMAGE, UNKNOWN = range(2)

    def __del__(self):
        if hasattr(self, "_file") and type(self._file) == file and (not self._file.closed):
            self._file.close()

    @property
    def file(self):
        if not self._file:
            self.download()
        return self._file

    def download(self):
        try: response = urllib.urlopen(self['url'])
        except:
            print 'urlopen fail for ' + self.id + ': ' + json.dumps(self.get('url'))
            return False
        if response.getcode() != 200:
            print 'http fail ' + str(response.getcode()) + ': ' + self['url']
            return False
        self._file = os.tmpfile()
        self._file.write(response.read())
        return True

    @property
    def media_type(self):
        if self['mime'] in ['image/jpeg', 'image/png', 'image/gif']: return self.IMAGE
        return self.UNKNOWN

    def set_thumb(self, w, h, file=False):
        name = str(w) + 'x' + str(h)
        if not file: file = self.file

        try: thumb = generate_thumb(file, (w,h))
        except:
            print 'failed to generate thumb for file: ' + self.id
            return False # thumb generation is non-critical so we eat exception
        self.store(thumb, 'thumb', self.id + '_' + name, self['name'] + '_' + name)

        self.setdefault('thumbs', {})
        version = self['thumbs'][name] = self['thumbs'].get(name, 0) + 1
        url = "%s_%s?v=%s" % (self['url'], name, version)
        return {'url': url, 'file': thumb}

    def set_thumbs(self):
        if self.media_type != self.IMAGE: return
        thumb190 = self.set_thumb(190,190)
        if thumb190: self.set_thumb(70,70, file=thumb190['file'])

    def get_thumb(self, w, h):
        name = str(w) + 'x' + str(h)
        version = self.get('thumbs', {}).get(name)
        if version == None: return False
        return "%s_%s%s" % (self['url'].split('?')[0], name, '?v=' + str(version))

    def get_default_thumb(self):
        return self.get_thumb(190,190)
    default_thumb = property(get_default_thumb)

    @property
    def thumb_keys(self): return [ self.id + '_' + n for n in self.get('thumbs', {}) ]

    def store(self, file, bucket, path, name):
        file.seek(0)

        if self.config.aws_id:
            self['protocol'] = 's3'
            return self.db.s3.upload_file(file, bucket, self.id, self['name'], self['mime'])
        else:
            self['protocol'] = 'file'
            owner = self.db.User.fetch(self['owner'])
            self['fs_path'] = media_path(owner)
            with open(joinpath(self['fs_path'], id), 'w') as f: f.write(file.read())
            return abs_url() + 'file/' + owner['name'] + '/' + name

    def create(self):
        """ Uploads file to s3 if config.aws_id is defined, otherwise
        saves in config.media_path
        """

        self._file = self['tmp_file']
        del self['tmp_file']
        self['owner']

        # Image optimization
        if self.media_type == self.IMAGE:
            self._file.seek(0)
            imo = Img.open(self._file)
            #except:
            #    res.delete()
            #    return False
            updated = False
            if imo.size[0] > 1600 or imo.size[1] > 1000:
                ratio = float(imo.size[0]) / imo.size[1]
                new_size = (1600, int(1600 / ratio)) if ratio > 1.6 else (int(1000 * ratio), 1000)
                imo = imo.resize(new_size, resample=Img.ANTIALIAS)
                updated = True
            opts = {}
            mime = self['mime']
            if mime == 'image/jpeg': opts.update(quality = 70, format = 'JPEG')
            if mime == 'image/png': opts.update(optimize = True, format = 'PNG')
            if mime == 'image/gif' and updated: opts.update(format = 'GIF')
            if opts:
                newfile = os.tmpfile()
                imo.save(newfile, **opts)
                self._file.close()
                self._file = newfile

        self['url'] = self.store(self._file, 'media', self.id, self['name'])
        self._file.seek(0); self['md5'] = md5(self._file.read()).hexdigest()
        self['size'] = os.fstat(self._file.fileno()).st_size
        self.set_thumbs()
        super(File, self).create()
        return self

    # download file from source and reupload
    def reset_file(self, file=None):
        self.pop('s3_bucket', None)
        self.pop('fs_path', None)
        if not file: file = self.file
        self['url'] = self.store(file, 'media', self.id, self.get('name', 'untitled'))
        self.set_thumbs()
        if self._file: self._file.close()
        self.save()

    def delete_files(self):
        for k in self.thumb_keys + [self.id]:
            if self.get('s3_bucket'):
                k = self.db.s3_con.get_bucket(self['s3_bucket']).get_key(self.id)
                if k: k.delete()
            elif self.get('fs_path'):
                try: os.remove(self['fs_path'])
                except:
                    print 'can not delete missing file: ' + self['fs_path']


@Database.register
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


@Database.register
class MailLog(Entity):
    indexes = ['initiator', 'recipient', 'category', 'created']
    cname = 'mail_log'


@Database.register
class Unsubscribes(Entity):
    indexes = ['email']
    cname = 'unsubscribes'


@Database.register
class Feed(Entity):
    cname = 'feed'
    indexes = [ ('created', -1), ['entity', ('created', -1)], ['initiator', ('created', -1)], ['entity_owner', ('created', -1)] ]
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
        if self.entity.owner.id != self['initiator']: self.entity.owner.notify(self)

        return self

    def delete(self):
        class_name = type(self).__name__
        if self.entity:
            self.entity.update_cmd({'$inc': {'analytics.' + class_name + '.count': -1}})
        super(Feed, self).delete()

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
        # TODO: no good way to assert on broken db
        if self.initiator == None:
            return r
        if self.entity == None:
            return r
        r['initiator_thumb_70'] = self.initiator.get_thumb(70)
        if self['entity_class'] == 'User':
            r['entity_thumb_70'] = self.entity.get_thumb(70)
            r['entity_name'] = self.entity['name']
        elif self['entity_class'] == 'Expr':
            r['entity_title'] = self.entity.get('title')
            r['entity_owner_name'] = self.entity.owner['name']
        r['entity_url'] = self.entity.url
        return r


@Database.register
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


@Database.register
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


@Database.register
class Broadcast(Feed):
    action_name = 'broadcast'

    def create(self):
        if self.entity['owner'] == self['initiator']:
            raise "You mustn't broadcast your own expression"
        if type(self.entity) != Expr: raise "You may only broadcast expressions"
        if self.db.Broadcast.find({ 'initiator': self['initiator'], 'entity': self['entity'] }): return True
        return super(Broadcast, self).create()


@Database.register
class InviteNote(Feed):
    action_name = 'gave invites'


@Database.register
class NewExpr(Feed):
    action_name = 'created'


@Database.register
class UpdatedExpr(Feed):
    action_name = 'updated'

    def create(self):
        # if there's another update to this expr within 24 hours, delete it
        prev = self.db.UpdatedExpr.last({ 'initiator': self['initiator'], 'entity': self['entity'] })
        if prev and now() - prev['created'] < 86400: prev.delete()
        super(UpdatedExpr, self).create()
        return self


@Database.register
class FriendJoined(Feed):
    def viewable(self, viewer):
        return self['entity'] == viewer.id

    def create(self):
        if self.db.FriendJoined.find({ 'initiator': self['initiator'], 'entity': self['entity'] }): return True
        return super(FriendJoined, self).create()


@Database.register
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
        url = AbsUrl('create_account/' + self.get('key'))
        if self.get('to'): url.query.update({'email': self['to']})
        return url


@Database.register
class Contact(Entity):
    cname = 'contact_log'
    indexes = ['created']


@Database.register
class ErrorLog(Entity):
    cname = 'error_log'
    indexes = ['created', 'type']


@Database.register
class Temp(Entity):
    cname = 'temp'


## utils


def get_id(entity_or_id):
    return entity_or_id if type(entity_or_id) == str else entity_or_id.id


## analytics utils

def tags_by_frequency(query):
    tags = {}
    for d in Expr.search(query):
        if d.get('tags_index'):
            for t in d.get('tags_index'): tags[t] = tags.get(t, 0) + 1
    counts = [[tags[t], t] for t in tags]
    counts.sort(reverse=True)
    return counts

## tools for full text search


class ESDatabase:
    # elasticsearch-able database, just for full-text search (tags, text, title)
    def __init__(self, db, index='expr_index'):
        self.index = index
        self.conn = pyes.ES('127.0.0.1:9200')
        self.db = db
        feed_mapping = {
            "class_name": {"type": "string", "index": "not_analyzed"},
            "updated": {"type": "float"},
            "created": {"type": "float"},
            "entity": {"type": "string", "index": "not_analyzed"},
            "entity_class": {"type": "string", "index": "not_analyzed"},
            "initiator": {"type": "string", "index": "not_analyzed"},
            "initiator_name": {"type": "string", "index": "not_analyzed"},
            "text": {"type": "string", "index": "not_analyzed"}
        }
        user_mapping = {
            "tags": {"type": "string",
            "index": "analyzed"},
            "fullname": {"type": "string",
            "index": "not_analyzed"},
            "name": {"type": "string",
            "index": "not_analyzed"},
            "updated": {"type": "float"}
        }
        expr_mapping = {
            "tags": {"type": "string", "index": "analyzed", "analyzer": "tag_analyzer"},
            "text": {"type": "string", "index": "analyzed"},
            "title": {"type": "string", "index": "analyzed"},
            "name": {"type": "string", "index": "analyzed"},
            "auth": {"type": "string", "index": "not_analyzed"},
            "owner": {"type": "string", "index": "not_analyzed"},
            "owner_name": {"type": "string", "index": "not_analyzed"},
            "updated": {"type": "float"},
            "created": {"type": "float"},
            "views": {"type": "integer"},
            "broadcast": {"type": "integer"},
            "star": {"type": "integer"}
        }

        self.settings = {
          "mappings": {
            "expr-type": {"properties": expr_mapping},
            "feed-type": {"properties": feed_mapping},
            "user-type": {"properties": user_mapping}
          },
          "settings": {
            "analysis": {
              "analyzer": {
                "default": {"tokenizer" : "standard", "filter" : ["standard", "lowercase", "stop", "kstem"]},
                "tag_analyzer": {"tokenizer" : "whitespace", "filter" : ["standard", "lowercase", "stop", "kstem"]}
              }
            }
          }
        }

        if not index in self.conn.indices.get_indices():
            self.conn.indices.create_index(index, self.settings)
            print "Indexing expr/feed/users from scratch, might take a while"
            exprs = db.Expr.search({})
            for expr in exprs:
                self.update(expr, es_type='expr-type', refresh=False)
            self.add_related_types()
            self.conn.indices.refresh()

        self.sync_with_mongo()

        return None

    def delete_index(self):
        self.conn.indices.delete_index(self.index)
        return None

    def delete_by_ids(self, ids):
        query = pyes.query.IdsQuery(ids)
        self.conn.delete_by_query(query=query, indices=self.index,
                                  doc_types=None)

    def parse_query(self, q):
        return self.db.parse_query(q)

    def create_query(self, search):
        # results match ALL of the search terms
        # query stemming disabled for phrase search

        # TODO: parse OR as boolean OR

        clauses = []

        text_clauses = []

        phrase_clauses = []

        if search.get('text'):
            text_clauses.append(pyes.query.TextQuery('_all', ' '.join(search['text']), analyzer='default', boost=2, operator="and"))
        if search.get('tags'):
            text_clauses.append(pyes.query.TextQuery('tags', ' '.join(search['tags']), analyzer='tag_analyzer', boost=5, operator="and"))

        if len(text_clauses) != 0:
            q1 = pyes.query.BoolQuery(must=text_clauses, boost=1)
            clauses.append(q1)

        for p in search.get('phrases',[]):
            phrase_clauses.append(pyes.query.TextQuery('text', p, type="phrase", analyzer='simple', boost=5))
            phrase_clauses.append(pyes.query.TextQuery('title', p, type="phrase", analyzer='simple', boost=7))

        if len(phrase_clauses) != 0:
            q2 = pyes.query.BoolQuery(should=phrase_clauses, boost=2)
            clauses.append(q2)

        if search.get('user'):
            q3 = pyes.query.TermQuery('owner_name', search['user'], boost=3)
            clauses.append(q3)

        query = pyes.query.BoolQuery(must=clauses)

        custom_query = pyes.query.CustomScoreQuery(query, script=popularity_score)

        return custom_query

    def search_text(self, search, es_order, es_filter, start, limit):
        query = self.create_query(search)
        filtered_query = pyes.query.FilteredQuery(query, es_filter)
        results = self.conn.search(filtered_query, indices=self.index,
            doc_types="expr-type", sort=es_order, start=start, size=limit)
        return results

    def search_fuzzy(self, search, es_order, es_filter, start, limit):
        # typo-tolerant searches. only works for text/tags, not usernames.
        string = ' '.join(search.get('text',[]) + search.get('phrases',[]) + search.get('tags',[]))
        query = pyes.query.FuzzyLikeThisQuery(["tags", "text", "title"], string)
        filtered_query = pyes.query.FilteredQuery(query, es_filter)
        results = self.conn.search(filtered_query, indices=self.index,
            doc_types="expr-type", sort=es_order, start=start, size=limit)
        return results

    def update(self, entry, es_type, refresh=True):
        if es_type == 'expr-type':
            expr = entry
            processed_tags = ' '.join(normalize_tags(expr.get('tags', '')))
            data = {
                'text': expr.get('text', ''),
                'tags': processed_tags,
                'star': expr.get('analytics', {}).get(
                    'Star', {}).get('count', 0),
                'broadcast': expr.get('analytics', {}).get(
                    'Broadcast', {}).get('count', 0),
                'name': expr.get('name', ''),
                'owner_name': expr.get('owner_name', ''),
                'auth': expr.get('auth', 'public'),
                'owner': expr.get('owner', ''),
                'title': expr.get('title', ''),
                'created': expr.get('created', 0),
                'updated': expr.get('updated', 0),
                'views': expr.get('views', 0)
            }
        elif es_type == 'feed-type':
            data = dfilter(entry, ['class_name', 'created', 'entity',
                'entity_class', 'entity_owner', 'initiator', 'initiator_name',
                'text'])
        elif es_type == 'user-type':
            data = {
                'fullname': entry.get('fullname', ''),
                'name': entry.get('name', ''),
                'tags': entry.get('tags', []),
                'updated': entry.get('updated', 0)
            }
        else:
            raise Exception(es_type + " is not defined in this index!")
        self.conn.index(data, self.index, es_type, entry['_id'])
        if refresh is True:
            self.conn.indices.refresh()
        return None

    def sync_with_mongo(self):
        """make sure elasticsearch db reflects current mongodb state"""
        updated = self.conn.search(match_all_query, indices=self.index, sort="updated:desc")
        last_updated = updated[0]['updated']
        time_diff = time.time() - last_updated
        print 'time since last update:', time_diff
        exprs = self.db.Expr.search({'updated': {'$gte': last_updated}})
        feed = self.db.Feed.search({'updated': {'$gte': last_updated}})
        users = self.db.User.search({'updated': {'$gte': last_updated}})
        print exprs.count(), 'expressions to update'
        for expr in exprs:
            print expr['updated']
            self.update(expr, 'expr-type', refresh=False)
        print feed.count(), 'feed items to update'
        for f in feed:
            print f['updated']
            self.update(f, 'feed-type', refresh=False)
        print users.count(), 'users to update'
        for user in users:
            print user['updated']
            self.update(user, 'user-type', refresh=False)
        self.conn.indices.refresh()

    def purge_deleted(self, time_diff=0):
        """remove entries from elasticsearch that have been deleted in mongo"""
        #  time diff is the time in seconds to look back
        last_updated = time.time() - time_diff
        exprs = self.db.Expr.search({'updated': {'$gte': last_updated}})
        feed = self.db.Feed.search({'updated': {'$gte': last_updated}})
        users = self.db.User.search({'updated': {'$gte': last_updated}})
        valid_ids = []
        purge_ids = []
        for e in exprs:
            valid_ids.append(e['_id'])
        for u in users:
            valid_ids.append(u['_id'])
        for f in feed:
            valid_ids.append(f['_id'])
        q = pyes.query.RangeQuery(qrange=pyes.utils.ESRange('updated',
            from_value=last_updated))
        res = self.conn.search(q, indices=self.index)
        for r in res:
            if r._meta.id not in valid_ids:
                purge_ids.append(r._meta.id)
        print 'deleting: ', purge_ids
        self.delete_by_ids(purge_ids)
        self.conn.indices.refresh()

    def paginate(self, search, limit=40, at=0, es_order='_score,updated:desc',
        sort='score', fuzzy=False, viewer=None
    ):
        if viewer:
            es_filter = viewer.can_view_filter()
        else:
            es_filter = pub_filter
        if fuzzy:
            res = self.search_fuzzy(search, es_order=es_order, es_filter=es_filter,
                start=at, limit=limit)
        else:
            res = self.search_text(search, es_order=es_order, es_filter=es_filter,
                start=at, limit=limit)
        return self.esdb_paginate(res, es_type='expr-type')

    def esdb_paginate(self, res, es_type):
        # convert elasticsearch resultsets to result lists
        result_ids = [r._meta.id for r in res]
        if es_type == 'expr-type':
            col = self.db.Expr
        elif es_type == 'feed-type':
            col = self.db.Feed
        elif es_type == 'user-type':
            col = self.db.User
        return col.fetch(result_ids)

    def add_related_types(self):

        # Originally esdb was just used for full-text search over expressions.
        # However, we might want to do sorting and analytics based on
        # information in related collections (feed, user). Since elasticsearch
        # doesn't have joins, we have to index the mongo feed and user
        # collections in expr_index.

        feed = self.db.Feed.search({})

        users = self.db.User.search({})

        print "indexing feed-type"

        for f in feed:
            self.update(f, es_type='feed-type', refresh=False)

        self.conn.indices.refresh()

        print "indexing user-type"

        for u in users:
            self.update(u, es_type='user-type', refresh=False)

        self.conn.indices.refresh()

        return None

    def get_total(self, es_type):
        """show the total number of items of each type"""
        entries = self.conn.search(match_all_query,
            indices=self.index, doc_types=es_type)
        return entries.total
