import newhive
import re, pymongo, bson.objectid, random, urllib, os, time, json, math
import operator as op
from os.path import join as joinpath
from md5 import md5
from datetime import datetime
from lxml import html
from wsgiref.handlers import format_date_time
from newhive import social_stats
from itertools import ifilter, islice, izip_longest, chain
import PIL.Image as Img
from PIL import ImageOps
from bson.code import Code
from crypt import crypt
from oauth2client.client import OAuth2Credentials
from newhive.oauth import FacebookClient, FlowExchangeError, AccessTokenCredentialsError
#import pyes
from collections import defaultdict
from snapshots import Snapshots

from s3 import S3Interface
from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key

import Queue
import threading
from subprocess import call

from newhive.utils import *
from newhive.routes import reserved_words

from newhive.profiling import g_flags

import logging
logger = logging.getLogger(__name__)


entity_types = []
def register(entity_cls):
    entity_types.append(entity_cls)
    return entity_cls


class Database:
    def __init__(self, config=None, assets=None):
        config = self.config = (config if config else newhive.config)

        self.con = pymongo.Connection(host=config.database_host, port=config.database_port)
        self.mdb = self.con[config.database]
        self.s3 = S3Interface()
        self.assets = assets

        self.collections = map(lambda entity_type: entity_type.Collection(self, entity_type), entity_types)
        for col in self.collections:
            setattr(self, col.entity.__name__, col)
            for index in col.entity.indexes:
                (key, opts) = index if type(index) == tuple and type(index[1]) == dict else (index, {})
                key = map(lambda a: a if type(a) == tuple else (a, 1), [key] if not isinstance(key, list) else key)
                col._col.ensure_index(key, **opts)

        # initialize elasticsearch index (not used currently)
        # if config.use_esdb:
        #     self.esdb = ESDatabase(self)

    # def query(self, q, viewer=None, expr_only=None, fuzzy=False,
    #           es_order='_score,updated:desc', **args):
    #     return self._query(q, viewer, expr_only, fuzzy, es_order, **args)['result']

    # def _query(self, q, viewer=None, expr_only=None, fuzzy=False,
    #           es_order='_score,updated:desc', **args):
    # arg{id}: if not None, ensure this result appears in the feed
    def query_echo(self, q, expr_only=None, viewer=None, id=None, **args):
        args['viewer'] = viewer
        search = self.parse_query(q)

        while True:
            spec = {}
            if search.get('auth'): spec['auth'] = (
                'public' if search['auth'] == 'public' else 'password')

            # todo: put auth specs into elasticsearch searches
            # todo: make sure that elasticsearch pagination resultsets are of the correct
            #       size after filtering out exprs that are not viewable
            # todo: return grouped_feed items with expressions in network trending
            # todo: handle all queries with esdb for compound queries like '#Loves #food'

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
            elif any(k in search for k in ('tags', 'phrases', 'text', 'user')):
                owner = None
                if user and len(tags) == 1:
                    # if search has user and one tag,
                    # look for specific ordered list in user record
                    owner = self.User.named(user)
                if owner and owner.get('tagged', {}).has_key(tags[0]):
                    results = self.Expr.cards(owner['tagged'][tags[0]], viewer=viewer)
                else:
                    spec = {'auth': 'public'}
                    if search.get('tags'):
                        spec['tags_index'] = {'$all': search['tags']}
                    if search.get('text'):
                        spec['$or'] = [{'text_index': {'$all': search['text']}},
                            {'title_index': {'$all': search['text']}}]
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
                    results.sort(cmp=lambda x, y: cmp(x[sort], y[sort]), reverse=True)
            if not id or len(results) > 500:
                break;
            if len(filter(lambda x: x.id==id,results)):
                break;
            args['limit'] = (args.get('limit', 20) * 3/2)

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

        for pattern in re.findall(r'(\b|\W+)(\w+)', q):
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

        for k in ['text', 'tags', 'phrases', 'feed']:
            if len(search[k]) == 0:
                del search[k]

        return search

class Collection(object):
    trashable = True

    def __init__(self, db, entity):
        self.db = db
        self._col = db.mdb[entity.cname]
        self.entity = entity
        self.config = db.config

    def fetch_empty(self, key, keyname='_id'): return self.find_empty({ keyname : key })

    def fetch(self, key, keyname='_id', **opts):
        if type(key) == list:
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
        if type(spec) == list:
            items = {}
            res = []
            filter.update({'_id': {'$in': spec }})
            for e in self.search(filter, **opts):
                items[e.id] = e
            for i in spec:
                if items.has_key(i): res.append(items[i])
            return res
        return Cursor(self, self._col.find(spec=spec, **opts))

    # Should be overridden to ommit fields not used in list views
    # TODO: fix privacy for viewer
    def cards(self, spec, viewer=None, **opts):
        return self.search(spec, **opts)

    def last(self, spec={}, **opts):
        opts.update({'sort' : [('_id', -1)]})
        return self.find(spec, **opts)

    def paginate(self, spec, limit=20, at=0, sort='updated', order=-1, filter=None):
        # page_is_id = is_mongo_key(at)
        # if at and not page_is_id:
        at = int(at)

        if type(spec) == dict:
            # if page_is_id:
            #     page_start = self.fetch(at)
            #     at = page_start[sort] if page_start else None

            # if at and sort: spec[sort] = { '$lt' if order == -1 else '$gt': at }

            res = self.cards(spec, sort=[(sort, order)], skip=at)

            # if there's a limit, collapse to list, get sort value of last item
            if limit:
                if filter:
                    res = ifilter(filter, res)
                res = islice(res, limit)
                res = list(res)
            return res

        elif type(spec) == list:
            # spec = uniq(spec)
            # assert( not at or page_is_id )

            try:
                # start = spec.index(at) if at else -1
                start = at
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
    def page(self, spec, sort='updated', **opts):
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

    def next(self): 
        return self.collection.new(self._cur.next())

    def __iter__(self): return self

# helper class for a "page" (a list of entities)
class Page(list):
    next = None
    total = 0

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

    # should be avoided, because it clobbers record. Use update instead
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

    def delete(self):
        res = self._col.remove(spec_or_id=self.id, safe=True)
        if self.Collection.trashable:
            self.db.Trash.create(self.cname, self)
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
        if not isinstance(v, (str, unicode)): return False
        # TODO: Test this with non-ascii text
        if password == v: return True
        return (crypt(v.encode('UTF8'), password) == password)

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
        dict.update(self,
            fullname = self.get('fullname', self['name']),
            referrals = 0,
            flags = {},
        )
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
        self['notification_count'] += 1
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

    def activity(self, **args):
        if not self.id: return []
        # TODO-feature: create list of exprs user is following comments on in
        # user record, so you can leave a comment thread
        commented_exprs = [r['entity'] for r in
            self.db.Comment.search({'initiator': self.id})]
        return self.db.Feed.paginate({'$or': [
            {'entity_owner': self.id},
            {'initiator': self.id},
            {'entity': {'$in': commented_exprs}, 'class_name': 'Comment'}
        ]}, **args)

    def feed_profile_entities(self, **args):
        res = self.feed_profile(**args)
        for i, item in enumerate(res):
            if item.type == 'FriendJoined': continue
            entity = item.initiator if item.entity.id == self.id else item.entity
            entity['feed'] = [item]
            res[i] = entity
        return res

    # def feed_page_esdb(self, at=0, limit=40, feed=False, trending=False, **opts):
    #     def index_max(values):
    #         return max(xrange(len(values)),key=values.__getitem__)
    #     # Filter for expressions which are viewable by self (for security)
    #     # Currently broken.
    #     f_view = self.can_view_filter()

    #     # Filter for Feed actions from users followed by self
    #     f_user_class_name = pyes.filters.TermsFilter('class_name', ['NewExpr',
    #         'Broadcast', 'Star', 'UpdatedExpr', 'NewExpr'])
    #     f_user_initiator = pyes.filters.TermsFilter('initiator', self.starred_user_ids)
    #     f_user = pyes.filters.BoolFilter(must=[f_user_initiator, f_user_class_name])

    #     # Filter for Comment and UpdatedExpr Feed actions for starred expressions
    #     # from followed users excluding self's comments
    #     f_expr_class_name = pyes.filters.TermsFilter('class_name', ['UpdatedExpr', 'Comment'])
    #     f_expr_entity = pyes.filters.TermsFilter('entity', self.starred_expr_ids)
    #     f_expr_initiator = pyes.filters.TermFilter('initiator', self.id)
    #     f_expr = pyes.filters.BoolFilter(must=[f_expr_class_name, f_expr_entity], must_not=[f_expr_initiator])

    #     if self.get('tags_following') is not None:
    #         q_tags = pyes.query.TermsQuery('tags', self.get('tags_following'))
    #         # q_tags = pyes.query.FilteredQuery(q_tags, f_view)

    #     f = pyes.filters.BoolFilter(should=[f_user, f_expr])
    #     fq = pyes.query.FilteredQuery(match_all_query, f)

    #     total_limit = 20*limit
    #     # since there may be many feed items for the same expression
    #     # note that with the current pagination, the maximum number of
    #     # retrievable feed items is total_limit

    #     res_feed = self.db.esdb.conn.search(fq, indices=self.db.esdb.index,
    #                                         doc_types="feed-type",
    #                                         sort="created:desc", size=total_limit)

    #     # maps from (expression id) -> list
    #     feed_with_expr = defaultdict(list)  # -> list of feed ids
    #     user_with_expr = defaultdict(list)  # -> list of initiator ids
    #     time_with_expr = defaultdict(list)  # -> list of update time

    #     # if feed == 'trending' or trending is True:
    #     for r in res_feed[:total_limit]:
    #         feed_with_expr[r['entity']].append(r._meta.id)
    #         user_with_expr[r['entity']].append(r['initiator'])
    #         if (r.has_key('updated')):
    #             time_with_expr[r['entity']].append(r['updated'])
    #         else:
    #             time_with_expr[r['entity']].append(r['created'])

    #     # Grab all the expressions with followed tags and insert into lists
    #     # NOTE: these items only get time, not feed or user, because there is
    #     # no associated feed item.
    #     # TODO: This code needs to be examined for efficiency.
    #     if self.get('tags_following'):
    #         expr_tags = self.db.esdb.conn.search(q_tags, indices=self.db.esdb.index,
    #             doc_types="expr-type",
    #             sort="updated:desc", size=total_limit)
    #         for r in expr_tags[:total_limit]:
    #             time_with_expr[r._meta.id].append(r['updated'])

    #     expr_ids = time_with_expr.keys()
    #     qid = pyes.query.IdsQuery(expr_ids)
    #     query = qid
    #     # BUGBUG: why is filtering broken?
    #     # query = pyes.query.FilteredQuery(qid, f_view)
    #     # would also be nice to be able to filter by read/unread.
    #     if self.get('tags_following') is not None:
    #         query = pyes.query.BoolQuery(should=[query, q_tags])
    #     custom_query = pyes.query.CustomScoreQuery(query,
    #                                                script=popularity_time_score)
    #     if feed == 'trending' or trending is True:
    #         res = self.db.esdb.conn.search(custom_query, indices=self.db.esdb.index,
    #                                        doc_types="expr-type", start=at,
    #                                        sort="_score,created:desc", size=limit)
    #         items = self.db.esdb.esdb_paginate(res, es_type='expr-type')
    #     else:
    #         # if self.get('tags_following') is not None:
    #         #     query = pyes.query.BoolQuery(should=[query, q_tags])

    #         # Just use the max age of the commingled ids set
    #         # All this data is in time_with_expr.
    #         id_times = []
    #         for eid in expr_ids:
    #             id_times.append((eid, max(time_with_expr[eid])))
    #         id_times = sorted(id_times, key=lambda x: x[1], reverse=True)
    #         ids = [x[0] for x in id_times][at : at + limit]
    #         # Use mongo whenever possible.
    #         items = self.db.Expr.fetch(ids)
    #         # qid = pyes.query.IdsQuery(ids)

    #         # res = self.db.esdb.conn.search(qid, indices=self.db.esdb.index,
    #         #                                doc_types="expr-type", start=0, size=limit)
    #         #                                # sort="created:desc", size=limit)
    #     # else:
    #     #     items = Page([])
    #     #     new_at = at
    #     #     # res_feed is all relevant feed actions, sorted by created: desc.
    #     #     # i think it's too late to add tags.
    #     #     for r in res_feed[at:]:
    #     #         # print r['created']
    #     #         new_at += 1
    #     #         feed_with_expr[r['entity']].append(r._meta.id)
    #     #         user_with_expr[r['entity']].append(r['initiator'])
    #     #         if r['entity'] not in [i['_id'] for i in items]:
    #     #             # bad: multiple expr fetch should be batched
    #     #             expr = self.db.Expr.fetch(r['entity'])
    #     #             if expr is not None and self.can_view(expr):
    #     #                 expr['feed_latest'] = r['created']
    #     #                 items.append(expr)
    #     #         if len(items) == limit:
    #     #             items.next = min(new_at, res_feed.total)
    #     #             break
    #     #         if self.get('tags') is not None:
    #     #             fl = [i['feed_latest'] for i in items]
    #     #             query = pyes.query.RangeQuery(qrange=pyes.utils.ESRange('updated',
    #     #                         from_value=min(fl), to_value=max(fl)))
    #     #             query = pyes.query.BoolQuery(must=[query, q_tags])
    #     #             res = self.db.esdb.conn.search(query, indices=self.db.esdb.index,
    #     #                                            doc_types='expr-type', size=limit)
    #     #     if items.next is None:
    #     #         items.next = res_feed.total

    #     for i in items:
    #         i['feed'] = feed_with_expr[i['_id']]
    #         i['feed_users'] = user_with_expr[i['_id']]
    #     return items

    def network_feed_items(self, limit=0, at=0):
        # get iterable for all feed items in your network
        user_action = {
                'initiator': {'$in': self.starred_user_ids},
                'class_name': {'$in': ['NewExpr', 'Broadcast', 'Star']}
                }
        own_broadcast = { 'initiator': self.id, 'class_name': 'Broadcast' }
        expression_action = {
                'entity': {'$in': self.starred_expr_ids}
                , 'class_name': {'$in':['Comment', 'UpdatedExpr']}
                , 'initiator': { '$ne': self.id }
                }
        or_clause = [user_action, own_broadcast, expression_action]
        return self.db.Feed.search({ '$or': or_clause }, limit=limit,
            sort=[('created', -1)])

    def exprs_tagged_following(self, limit=0):
        # return iterable of matching expressions for each tag you're following
        tags = self.get('tags_following', [])
        queries = [self.db.query('#' + tag) for tag in tags]

        return (item for grp in izip_longest(*queries) for item in grp)

    # TODO-polish merge with db.query to enable searching within feed
    def feed_trending(self, at=0, limit=20):
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
        result = sorted(exprs_by_id.values(),
            key=lambda x: x['score'], reverse=True)
        return result[at:at+limit]

    # TODO-polish merge with db.query to enable searching within feed
    def feed_recent(self, spec={}, limit=20, at=0, **args):
        at=int(at)
        limit=int(limit)
        feed_items = self.network_feed_items()#limit=limit*4, at=at)
        tagged_exprs = self.exprs_tagged_following()

        # group feed items into expressions, alternate
        # these with tagged_exprs and de-duplicate
        exprs = {}
        result = []
        def add_expr(r):
            r['feed'] = []
            exprs[r.id] = r
            return r
        while len(result) < (limit + at):
            item = False
            # grab one from feed_items
            for r in feed_items:
                existing = item = exprs.get(r['entity'])
                if not item:
                    expr = self.db.Expr.fetch(r['entity'], meta=True)
                    if not expr: continue
                    item = add_expr(expr)
                if (r['class_name'] != 'NewExpr') and len(item['feed']) < 3:
                    item['feed'].append(r)
                if (item['auth'] != 'public') or existing: continue
                result.append(item)
                break
            for r in tagged_exprs:
                if exprs.get(r.id): continue
                else:
                    item = add_expr(r)
                    result.append(item)
                    break
            if not item: break

        return result[at:]

    def profile(self, limit=20, at=0):
        at=int(at)
        limit=int(limit)
        spec = {'initiator': self.id,
            'class_name': {'$in': ['Broadcast','UpdatedExpr','NewExpr']}
        }
        result = []
        exprs = {}
        for r in self.db.Feed.search(spec, order='created'):
            if len(result) >= (limit + at): break
            if exprs.get(r['entity']): continue
            exprs[r['entity']] = True
            if r.entity and r.entity.get('auth') == 'public':
                result.append(r.entity)
        return result[at:]

    # # wrapper around db.query('#Trending') to add recent feed items
    # def feed_trending(self, **paging_args):
    #     self.db.query('#Trending')

    def build_search(self, d):
        d['text_index'] = normalize( self['name'] + ' ' + self.get('fullname', '') )

    def new_referral(self, d, decrement=True):
        if self.get('referrals', 0) > 0 or self == self.db.User.root_user or self == self.db.User.site_user:
            if decrement: self.increment({ 'referrals': -1 })
            d.update(user = self.id)
            return self.db.Referral.create(d)

    def give_invites(self, count):
        self.increment({'referrals':count})
        self.db.InviteNote.create(self.db.User.named(self.db.config.site_user), self, data={'count':count})

    def cmp_password(self, v):
        if not isinstance(v, (str, unicode)): return False
        return crypt(v.encode('UTF8'), self['password']) == self['password']

    def get_url(self, path='profile/', relative=False, secure=False):
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

    def client_view(self, viewer=None, special={}, activity=0):
        user = self.db.User.new( dfilter( self, [
            'fullname', 'name', 'email', 'profile_about', 'profile_thumb',
            'profile_bg', 'thumb_file_id', 'tags', 'updated', 'created', 'feed'
        ] ) )
        ###########################################################
        # TODO: make sure this field is updated wherever views changes elsewhere
        # TODO: figure out best thing to do for empty user
        # TODO: make new class for analytics.
        #   Add tests to verify info survives new views, add/delete loves, users
        if self.has_key('analytics'):
            updates = {}
            if not self['analytics'].has_key('views_by'):
                updates.update({'views_by': 
                    sum([r['views'] for r in self.db.Expr.search({'owner':self['_id']})])})
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
                expressions = self.get_expr_count(), # Why expressions->count?  nothing else is in there.
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
        if special.has_key("mini_expressions") and g_flags['mini_expressions']:
            # exprs = self.db.Expr.cards({'owner': self.id}, limit=3)
            exprs = self.get_top_expressions(g_flags['mini_expressions'])
            dict.update(user, dict(
                mini_expressions = map(lambda e:e.mini_view(), exprs)))
        if viewer: dict.update(user, listening = self.id in viewer.starred_user_ids )
        if activity > 0:
            dict.update( user, activity=
                map(lambda r: r.client_view(),
                    list(self.activity(limit=activity))) )
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
        return self.get('name') in self.db.config.admins


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
        ignore_not_meta = { 'apps': 0, 'background': 0, 'text_index': 0,
            'title_index': 0, 'file_id': 0, 'images': 0  }

        def named(self, username, name): return self.find({'owner_name': username, 'name': name})

        def cards(self, spec, viewer=None, **opts):
            filter = {}
            spec2 = spec if type(spec) == dict else filter
            if viewer and viewer.logged_in:
                spec2.update({'$or': [
                    {'auth': 'public'}, {'owner': viewer.id}]})
            else:
                spec2.update({'auth': 'public'})
            opts.setdefault('fields', self.ignore_not_meta)
            return self.search(spec, filter, **opts)

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
            [user, name] = url.split('/')[-2:]
            return cls.named(user, name)

        def page(self, spec, viewer, auth='public', tag=None, sort='updated', **args):
            if tag: spec.update(tags_index=tag) # normalize tag input?

            if type(spec) == dict:
                spec.update(auth=auth)

            assert(sort in ['updated', 'random'])
            args.update(sort=sort)
            rs = self.paginate(spec, **args)

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

    def entropy(self, force_update = False):
        if force_update or (not self.get('entropy')):
            self['entropy'] = junkstr(8)
        return self['entropy']

    def snapshot_name_base(self, size, time):
        return '_'.join([self.id, time, self.entropy(), size]) + (".jpg" if (size == "full") else ".png")

    # size is "big" or "small".
    # will return 'snapshot_placeholder.png' if no available snapshot
    def snapshot_name(self, size):
        if not self.get('snapshot_time'): return False
        filename = self.snapshot_name_base(size, str(self.get('snapshot_time')))
        return 'https://%s.s3.amazonaws.com/%s' % (self.db.config.s3_buckets['thumb'], filename)

    def snapshot_name_prefix(self):
        name = self.snapshot_name('')
        return name[:-4] if name else name

    def take_full_shot(self):
        snapshotter = Snapshots()

        name = self.snapshot_name_base("full", str(self.get('snapshot_time')))[:-4] + ".jpg"
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
        snapshot_time = int(now())
        dimension_list = [(715, 430, "big"), (390, 235, "small"), (70, 42, 'tiny')]
        upload_list = []

        for w, h, size in dimension_list:
            name = self.snapshot_name_base(size, str(snapshot_time))
            # This would be cleaner with file pipes instead of filesystem.
            local = '/tmp/' + name
            if w == dimension_list[0][0]:
                r = snapshotter.take_snapshot(self.id, dimensions=(w,h),
                    out_filename=local)
                if not r:
                    return False
            else:
                f = open(upload_list[0][0], "r")
                local = generate_thumb(f, (w, h), "png")
            upload_list.append((local,name))

        # clean up local files, upload them atomically to s3 (on success)
        for local, name in upload_list:
            url = self.db.s3.upload_file(local, 'thumb', name, mimetype='image/png')
        # need to delete local
        call(["rm", upload_list[0][0]])

        # Delete old snapshot
        if old_time:
            for w, h, size in dimension_list:
                name = self.snapshot_name_base(size, str(old_time))
                self.db.s3.delete_file('thumb', name)

        self.update(snapshot_time=snapshot_time, entropy=self['entropy'],
            updated=False)
        return True

    # @property
    def snapshot(self, size='big', update=True):
        # Take new snapshot if necessary and requested
        if update and (not self.get('snapshot_time') or self.get('updated') > self.get('snapshot_time')):
            self.take_snapshots()
        return self.snapshot_name(size)

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
        if d.get('auth') == 'public':
            d['password'] = None
        super(Expr, self).update(**d)
        self.owner.get_expr_count(force_update=True)
        if d.get('apps') or d.get('background'): self.threaded_snapshot(retry=120)
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
        for r in self.db.Feed.search({'entity': self.id}): r.delete()
        return super(Expr, self).delete()

    def increment_counter(self, counter):
        assert counter in self.counters, "Invalid counter variable.  Allowed counters are " + str(self.counters)
        return self.increment({counter: 1})

    @property
    def views(self): return self.get('views', 0)

    def mini_view(self):
        mini = dfilter( self, ['name', 'owner_name'] )
        mini['id'] = self['_id']
        snapshot = self.snapshot_name_prefix()
        mini['snapshot_tiny'] = (self.snapshot_name_prefix() + 'tiny.png'
            if snapshot else
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

    def client_view(self, viewer=None, special={}, activity=0):
        counts = dict([ ( k, v.get('count', 0) ) for
            k, v in self.get('analytics', {}).iteritems() ])
        counts['Views'] = self.views
        counts['Comment'] = self.comment_count
        expr = dfilter(self, ['name', 'title', 'snapshot', 'feed', 'created',
            'updated', 'password'])
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
        expr['snapshot'] = self.snapshot_name_prefix()
        if viewer and viewer.is_admin:
            dict.update(expr, { 'featured': self.is_featured })

        if activity > 0:
            # bugbug: we will want to limit the initial download to client (and paginate)
            # bugbug: we should only send the client the data it needs, namely, the icons
            dict.update( expr, comments = self.comment_feed() )
            dict.update( expr, loves = self.loves_feed() )
            dict.update( expr, broadcast = self.broadcast_feed() )
            dict.update( expr, activity = self.activity_feed(None, activity) )
            # dict.update( expr, activity =
            #     map(lambda r: r.client_view(),
            #         self.db.Feed.search({'entity':self.id})) [0:activity] )
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


def generate_thumb(file, size, format='jpeg'):
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
    imo.save(output, format=format, quality=70)
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
        if (type(self._file) == file
            and (not self._file.closed)): self._file.close()

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
        if self['mime'] in ['image/jpeg', 'image/png', 'image/gif']:
            return self.IMAGE
        return self.UNKNOWN

    def set_thumb(self, w, h, file=False):
        name = str(w) + 'x' + str(h)
        thumbs = self.get('thumbs', {})
        if thumbs.get(name): return False

        if not file: file = self.file
        try: thumb_file = generate_thumb(file, (w,h))
        except:
            print 'failed to generate thumb for file: ' + self.id
            return False # thumb generation is non-critical so we eat exception
        url = self.db.s3.upload_file(thumb_file, 'media', self._thumb_name(w, h),
            self['name'] + '_' + name, 'image/jpeg')

        thumbs[name] = True
        self.update(thumbs=thumbs)
        return thumb_file

    def _thumb_name(self, w, h):
        return self.id + '_' + str(w) + 'x' + str(h)

    def get_thumb(self, w, h):
        name = str(w) + 'x' + str(h)
        if not self.get('thumbs', {}).get(name): return False
        url = self.get('url')
        if not url: return False
        return url + '_' + name

    def get_default_thumb(self):
        return self.get_thumb(190,190)
    default_thumb = property(get_default_thumb)

    @property
    def thumb_keys(self):
        return [ self.id + '_' + n for n in self.get('thumbs', {}) ]

    def store(self):
        if self.db.config.aws_id:
            self['protocol'] = 's3'
            self['s3_bucket'] = self.db.s3.buckets['media'].name
            return self.db.s3.upload_file(self._file, 'media', self.id,
                self['name'], self['mime'])
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
        self['url'] = self.store()
        self.update(url=self['url'])
        return self

    # download file from source and reupload
    def reset_file(self, file=None):
        self.pop('s3_bucket', None)
        self.pop('fs_path', None)
        if not file: file = self.file
        self['url'] = self.store()
        if self._file: self._file.close()
        self.update(**self)

    def delete_files(self):
        for k in self.thumb_keys + [self.id]:
            if self.get('s3_bucket'):
                k = self.db.s3_con.get_bucket(self['s3_bucket']).get_key(self.id)
                if k: k.delete()
            elif self.get('fs_path'):
                try: os.remove(self['fs_path'])
                except:
                    print 'can not delete missing file: ' + self['fs_path']

    def client_view(self, viewer=None, activity=0):
        r = dfilter(self, ['name', 'mime', 'owner', 'url', 'thumbs'])
        dict.update(r, id=self.id, thumb_big=self.get_thumb(222,222),
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
        if (self["entity_class"] == 'Expr' and self["class_name"] == 'Star' and
            self.entity.owner['analytics'].get('loves_by')):
                self.entity.owner.increment({'analytics.loves_by': 1})

        if self.entity.owner.id != self['initiator']: self.entity.owner.notify(self)

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
        if self['class_name'] == 'Broadcast':
            r['action'] = 'Republish'

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
            raise "You mustn't broadcast your own expression"
        if type(self.entity) != Expr: raise "You may only broadcast expressions"
        if self.db.Broadcast.find({ 'initiator': self['initiator'], 'entity': self['entity'] }): return True
        return super(Broadcast, self).create()


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
        prev = self.db.UpdatedExpr.last({ 'initiator': self['initiator'], 'entity': self['entity'] })
        if prev and now() - prev['created'] < 86400: prev.delete()
        super(UpdatedExpr, self).create()
        return self


@register
class FriendJoined(Feed):
    def viewable(self, viewer):
        return self['entity'] == viewer.id

    def create(self):
        if self.db.FriendJoined.find({ 'initiator': self['initiator'], 'entity': self['entity'] }): return True
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
        url = AbsUrl('create_account/' + self.get('key'))
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


@register
class Trash(Entity):
    """ This collection is for records that are deleted but should be restorable
        in their original table """

    cname = 'trash'
    indexes = ['record.id','record.created','record.updated']

    class Collection(Collection):
        trashable = False
        def create(self, collection_name, record):
            entity = {}
            entity['collection'] = collection_name
            entity['record'] = record
            return super(Trash.Collection, self).create(entity)


## utils

def mk_password(v):
    salt = "$6$" + junkstr(8)
    return crypt(v.encode('UTF8'), salt)

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
#class ESDatabase:
#    # elasticsearch-able database, just for full-text search (tags, text, title)
#    def __init__(self, db, index='expr_index'):
#        self.index = index
#        self.conn = pyes.ES(server=[('http', 'localhost', 9200)])
#        self.db = db
#        feed_mapping = {
#            "class_name": {"type": "string", "index": "not_analyzed"},
#            "updated": {"type": "double"},
#            "created": {"type": "double"},
#            "entity": {"type": "string", "index": "not_analyzed"},
#            "entity_class": {"type": "string", "index": "not_analyzed"},
#            "initiator": {"type": "string", "index": "not_analyzed"},
#            "initiator_name": {"type": "string", "index": "not_analyzed"},
#            "text": {"type": "string", "index": "not_analyzed"}
#        }
#        user_mapping = {
#            "tags": {"type": "string",
#            "index": "analyzed"},
#            "fullname": {"type": "string",
#            "index": "not_analyzed"},
#            "name": {"type": "string",
#            "index": "not_analyzed"},
#            "updated": {"type": "double"}
#        }
#        expr_mapping = {
#            "tags": {"type": "string", "index": "analyzed", "analyzer": "tag_analyzer"},
#            "text": {"type": "string", "index": "analyzed"},
#            "title": {"type": "string", "index": "analyzed"},
#            "name": {"type": "string", "index": "analyzed"},
#            "auth": {"type": "string", "index": "not_analyzed"},
#            "owner": {"type": "string", "index": "not_analyzed"},
#            "owner_name": {"type": "string", "index": "not_analyzed"},
#            "updated": {"type": "double"},
#            "created": {"type": "double"},
#            "views": {"type": "integer"},
#            "broadcast": {"type": "integer"},
#            "star": {"type": "integer"}
#        }
#
#        self.settings = {
#          "mappings": {
#            "expr-type": {"properties": expr_mapping},
#            "feed-type": {"properties": feed_mapping},
#            "user-type": {"properties": user_mapping}
#          },
#          "settings": {
#            "analysis": {
#              "analyzer": {
#                "default": {"tokenizer" : "standard", "filter" : ["standard", "lowercase", "stop", "kstem"]},
#                "tag_analyzer": {"tokenizer" : "whitespace", "filter" : ["standard", "lowercase", "stop", "kstem"]}
#              }
#            }
#          }
#        }
#
#        if not index in self.conn.indices.get_indices():
#            self.conn.indices.create_index(index, self.settings)
#            print "Indexing expr/feed/users from scratch, might take a while"
#            exprs = db.Expr.search({})
#            for expr in exprs:
#                self.update(expr, es_type='expr-type', refresh=False)
#            self.add_related_types()
#            self.conn.indices.refresh()
#
#        #self.sync_with_mongo()
#
#        return None
#
#    def delete_index(self):
#        self.conn.indices.delete_index(self.index)
#        self.conn.indices.refresh()
#        return None
#
#    def delete_by_ids(self, ids):
#        query = pyes.query.IdsQuery(ids)
#        self.conn.delete_by_query(query=query, indices=self.index,
#                                  doc_types=None)
#        self.conn.indices.refresh()
#
#    def parse_query(self, q):
#        return self.db.parse_query(q)
#
#    def create_query(self, search):
#        # results match ALL of the search terms
#        # query stemming disabled for phrase search
#
#        # TODO: parse OR as boolean OR
#
#        clauses = []
#
#        text_clauses = []
#
#        phrase_clauses = []
#
#        if search.get('text'):
#            text_clauses.append(pyes.query.TextQuery('_all', ' '.join(search['text']), analyzer='default', boost=2, operator="and"))
#        if search.get('tags'):
#            text_clauses.append(pyes.query.TextQuery('tags', ' '.join(search['tags']), analyzer='tag_analyzer', boost=5, operator="and"))
#
#        if len(text_clauses) != 0:
#            q1 = pyes.query.BoolQuery(must=text_clauses, boost=1)
#            clauses.append(q1)
#
#        for p in search.get('phrases',[]):
#            phrase_clauses.append(pyes.query.TextQuery('text', p, type="phrase", analyzer='simple', boost=5))
#            phrase_clauses.append(pyes.query.TextQuery('title', p, type="phrase", analyzer='simple', boost=7))
#
#        if len(phrase_clauses) != 0:
#            q2 = pyes.query.BoolQuery(should=phrase_clauses, boost=2)
#            clauses.append(q2)
#
#        if search.get('user'):
#            q3 = pyes.query.TermQuery('owner_name', search['user'], boost=3)
#            clauses.append(q3)
#
#        query = pyes.query.BoolQuery(must=clauses)
#
#        custom_query = pyes.query.CustomScoreQuery(query, script=popularity_score)
#
#        return custom_query
#
#    def search_text(self, search, es_order, es_filter, start, limit):
#        query = self.create_query(search)
#        filtered_query = pyes.query.FilteredQuery(query, es_filter)
#        # filtering borked...
#        results = self.conn.search(query, indices=self.index,
#            doc_types="expr-type", sort=es_order, start=start, size=limit)
#        return results
#
#    def search_fuzzy(self, search, es_order, es_filter, start, limit):
#        # typo-tolerant searches. only works for text/tags, not usernames.
#        string = ' '.join(search.get('text',[]) + search.get('phrases',[]) + search.get('tags',[]))
#        query = pyes.query.FuzzyLikeThisQuery(["tags", "text", "title"], string)
#        filtered_query = pyes.query.FilteredQuery(query, es_filter)
#        results = self.conn.search(filtered_query, indices=self.index,
#            doc_types="expr-type", sort=es_order, start=start, size=limit)
#        return results
#
#    def update(self, entry, es_type, refresh=True):
#        if es_type == 'expr-type':
#            expr = entry
#            processed_tags = ' '.join(normalize_tags(expr.get('tags', '')))
#            data = {
#                'text': expr.get('text', ''),
#                'tags': processed_tags,
#                'star': expr.get('analytics', {}).get(
#                    'Star', {}).get('count', 0),
#                'broadcast': expr.get('analytics', {}).get(
#                    'Broadcast', {}).get('count', 0),
#                'name': expr.get('name', ''),
#                'owner_name': expr.get('owner_name', ''),
#                'auth': expr.get('auth', 'public'),
#                'owner': expr.get('owner', ''),
#                'title': expr.get('title', ''),
#                'created': expr.get('created', 0),
#                'updated': expr.get('updated', 0),
#                'views': expr.get('views', 0)
#            }
#        elif es_type == 'feed-type':
#            data = dfilter(entry, ['class_name', 'created', 'entity',
#                'entity_class', 'entity_owner', 'initiator', 'initiator_name',
#                'text'])
#        elif es_type == 'user-type':
#            data = {
#                'fullname': entry.get('fullname', ''),
#                'name': entry.get('name', ''),
#                'tags': entry.get('tags', []),
#                'updated': entry.get('updated', 0)
#            }
#        else:
#            raise Exception(es_type + " is not defined in this index!")
#        self.conn.index(data, self.index, es_type, entry['_id'])
#        if refresh is True:
#            self.conn.indices.refresh()
#        return None
#
#    def sync_with_mongo(self):
#        """make sure elasticsearch db reflects current mongodb state"""
#        updated = self.conn.search(match_all_query, indices=self.index, sort="updated:desc")
#        last_updated = updated[0]['updated']
#        time_diff = time.time() - last_updated
#        print 'time since last update:', time_diff
#        exprs = self.db.Expr.search({'updated': {'$gte': last_updated}})
#        feed = self.db.Feed.search({'updated': {'$gte': last_updated}})
#        users = self.db.User.search({'updated': {'$gte': last_updated}})
#        print exprs.count(), 'expressions to update'
#        for expr in exprs:
#            print expr['updated']
#            self.update(expr, 'expr-type', refresh=False)
#        print feed.count(), 'feed items to update'
#        for f in feed:
#            print f['updated']
#            self.update(f, 'feed-type', refresh=False)
#        print users.count(), 'users to update'
#        for user in users:
#            print user['updated']
#            self.update(user, 'user-type', refresh=False)
#        self.conn.indices.refresh()
#
#    def purge_deleted(self, time_diff=0):
#        """remove entries from elasticsearch that have been deleted in mongo"""
#        #  time diff is the time in seconds to look back
#        last_updated = time.time() - time_diff
#        exprs = self.db.Expr.search({'updated': {'$gte': last_updated}})
#        feed = self.db.Feed.search({'updated': {'$gte': last_updated}})
#        users = self.db.User.search({'updated': {'$gte': last_updated}})
#        valid_ids = []
#        purge_ids = []
#        for e in exprs:
#            valid_ids.append(e['_id'])
#        for u in users:
#            valid_ids.append(u['_id'])
#        for f in feed:
#            valid_ids.append(f['_id'])
#        q = pyes.query.RangeQuery(qrange=pyes.utils.ESRange('updated',
#            from_value=last_updated))
#        res = self.conn.search(q, indices=self.index)
#        for r in res:
#            if r._meta.id not in valid_ids:
#                purge_ids.append(r._meta.id)
#        print 'deleting: ', purge_ids
#        self.delete_by_ids(purge_ids)
#        self.conn.indices.refresh()
#
#    def paginate(self, search, limit=40, at=0, es_order='_score,updated:desc',
#        sort='score', fuzzy=False, viewer=None
#    ):
#        if viewer:
#            es_filter = viewer.can_view_filter()
#        else:
#            es_filter = pub_filter
#        if fuzzy:
#            res = self.search_fuzzy(search, es_order=es_order, es_filter=es_filter,
#                start=at, limit=limit)
#        else:
#            res = self.search_text(search, es_order=es_order, es_filter=es_filter,
#                start=at, limit=limit)
#        return self.esdb_paginate(res, es_type='expr-type')
#
#    def esdb_paginate(self, res, es_type):
#        # convert elasticsearch resultsets to result lists
#        result_ids = [r._meta.id for r in res]
#        if es_type == 'expr-type':
#            col = self.db.Expr
#        elif es_type == 'feed-type':
#            col = self.db.Feed
#        elif es_type == 'user-type':
#            col = self.db.User
#        return col.fetch(result_ids)
#
#    def add_related_types(self):
#
#        # Originally esdb was just used for full-text search over expressions.
#        # However, we might want to do sorting and analytics based on
#        # information in related collections (feed, user). Since elasticsearch
#        # doesn't have joins, we have to index the mongo feed and user
#        # collections in expr_index.
#
#        feed = self.db.Feed.search({})
#
#        users = self.db.User.search({})
#
#        print "indexing feed-type"
#
#        for f in feed:
#            self.update(f, es_type='feed-type', refresh=False)
#
#        self.conn.indices.refresh()
#
#        print "indexing user-type"
#
#        for u in users:
#            self.update(u, es_type='user-type', refresh=False)
#
#        self.conn.indices.refresh()
#
#        return None
#
#    def get_total(self, es_type):
#        """show the total number of items of each type"""
#        entries = self.conn.search(match_all_query,
#            indices=self.index, doc_types=es_type)
#        return entries.total
#
#popularity_score = (
#    "_score * (doc['views'].value + 100*doc['star'].value" +
#    "+ 500*doc['broadcast'].value)"
#    )
#popularity_time_score = (
#    "(doc['views'].value + 100*doc['star'].value" +
#    "+ 500*doc['broadcast'].value) *" +
#    "exp((doc['created'].value - time()/1000)/1000000)"
#    )
#
