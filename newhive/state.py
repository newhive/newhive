import re, pymongo, bson.objectid, random, urllib, os, mimetypes, time, getpass, exceptions, json
import operator as op
from os.path import join as joinpath
from md5 import md5
from datetime import datetime
from lxml import html
from wsgiref.handlers import format_date_time
from newhive import social_stats, config
from itertools import ifilter, islice
import PIL.Image as Img
from PIL import ImageOps
from bson.code import Code
from crypt import crypt
from oauth2client.client import OAuth2Credentials
from newhive.oauth import FacebookClient, FlowExchangeError, AccessTokenCredentialsError
import pyes

from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key

from newhive.utils import *

import logging
logger = logging.getLogger(__name__)

class Database:
    entity_types = [] # list of entity classes

    @classmethod
    def register(cls, entity_cls):
        cls.entity_types.append(entity_cls)
        return entity_cls

    def add_collection(self, col):
        pass

    def __init__(self, config):
        self.config = config

        # initialize s3 connection
        if config.aws_id:
            self.s3_con = S3Connection(config.aws_id, config.aws_secret)
            self.s3_buckets = map(lambda b: self.s3_con.create_bucket(b), config.s3_buckets)

        self.con = pymongo.Connection(host=config.database_host, port=config.database_port)
        self.mdb = self.con[config.database]

        self.collections = map(lambda entity_type: entity_type.Collection(self, entity_type), self.entity_types)
        for col in self.collections:
            setattr(self, col.entity.__name__, col)
            for index in col.entity.indexes:
                (key, opts) = index if type(index) == tuple and type(index[1]) == dict else (index, {})
                key = map(lambda a: a if type(a) == tuple else (a, 1), [key] if not isinstance(key, list) else key)
                col._col.ensure_index(key, **opts)

        # initialize elasticsearch index
        self.esdb = ESDatabase(self)

    def query(self, q, viewer=None, limit=40, expr_only=None, **args):
        args['viewer'] = viewer
        args['limit'] = limit
        search = self.parse_query(q)

        # substitute featured with network when not logged in
        if not viewer and search.get('network'):
            search['featured'] = True
            del search['network']

        spec = {}
        #if search.get('text'): spec['text_index'] = { '$all': search['text'] }
        #if search.get('tags'): spec['tags_index'] = { '$all': search['tags'] }
        #if search.get('user'): spec['owner_name'] = search['user']
        if search.get('auth'): spec['auth'] = 'public' if search['auth'] == 'public' else 'password'

        if search.get('network'):
            results = viewer.feed_network(spec=spec, **args)
        elif search.get('featured'):
            results = self.Expr.page(self.User.root_user['tagged']['Featured'], **args)
        elif any (k in search for k in ('tags', 'phrases', 'text', 'user')):
            #use elasticsearch to search on these fields
            results = self.esdb.paginate(search, limit=40, start=0, es_order='_score,views:desc', es_filter=None, sort='score')
        else:
            sort = 'updated'
            results = self.Expr.page(spec, **args)
            if not expr_only:
                results = results + self.User.page(spec, **args)
                results.sort(cmp=lambda x, y: cmp(x[sort], y[sort]), reverse=True)

                # redo pagination property after merging possible user results with expr results
                results = Page(results)
                results.next = results[-1][sort] if len(results) == limit else None

        return results

    def parse_query(self, q):
        """ Parses search query into MongoDB spec
            #tag, @user, text, #SpecialCategory
        """

        # split into words with possible [@#] prefix, isolate phrases in quotes

        search = { 'text': [], 'tags': [], 'phrases': [] }
        q_quotes = re.findall(r'"(.*?)"',q,flags=re.UNICODE)
        q_no_quotes = re.sub(r'"(.*?)"', '', q, flags=re.UNICODE)

        search['phrases'].extend(q_quotes)

        for pattern in re.findall(r'(\b|\W+)(\w+)', q_no_quotes):
            prefix = re.sub( r'[^#@]', '', pattern[0] )
            if prefix == '@': search['user'] = pattern[1].lower()
            elif prefix == '#':
                if pattern[1] == 'All': search['all'] = True
                elif pattern[1] == 'Featured': search['featured'] = True
                elif pattern[1] == 'Network': search['network'] = True
                elif pattern[1] == 'Public': search['auth'] = 'public' 
                elif pattern[1] == 'Private': search['auth'] = 'password'
                elif pattern[1] == 'Activity': search['activity'] = True
                elif pattern[1] == 'Listening': search['listening'] = True
                elif pattern[1] == 'Listeners': search['listeners'] = True
                else: search['tags'].append( pattern[1].lower() )
            else: search['text'].append( pattern[1].lower() )

        return search

class Collection(object):
    def __init__(self, db, entity):
        self.db = db
        self._col = db.mdb[entity.cname]
        self.entity = entity

    def fetch_empty(self, key, keyname='_id'): return self.find_empty({ keyname : key })
    def fetch(self, key, keyname='_id', **opts):
        if type(key) == list:
            items = {}
            res = []
            for e in self.search({'_id': {'$in': key }}):
                items[e.id] = e
            for i in key:
                if items.has_key(i): res.append(items[i])
            return res
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
        return Cursor(self, self._col.find(spec=spec, **opts))

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
            res = self.search(spec, sort=[(sort, order)])
            # if there's a limit, collapse to list, get sort value of last item
            if limit:
                if filter:
                    res = ifilter(filter, res)
                res = islice(res, limit)
                res = Page(list(res))
                res.next = res[-1][sort] if len(res) == limit else None
            return res

        elif type(spec) == list:
            spec = uniq(spec)
            assert( not at or page_is_id )

            try:
                start = spec.index(at) if at else -1
                end = start + limit * -order
                if end > start:
                    if start >= len(spec): return Page([])
                    sub_spec = spec[start+1:end+1]
                else:
                    if start <= 0: return Page([])
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
                    return Page([])

            res = Page(self.fetch(sub_spec))
            res.next = lget(sub_spec, -1)
            return res

    # default implementation of pagination, intended to be overridden by
    # specific model classes
    def page(self, spec, viewer, sort='updated', **opts):
        return self.paginate(spec, **opts)

    def count(self, spec={}): return self.search(spec).count()

    # self.new can be overridden to return custom object types
    def new(self, d): return self.entity(self, d)

    def create(self, d):
        new_entity = self.new(d)
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

# helper class for a "page" (a list of entities)
class Page(list):
    next = None

class Entity(dict):
    """Base-class for very simple wrappers for MongoDB collections"""
    indexes = []
    Collection = Collection

    @property
    def type(self): return self.__class__.__name__

    def __init__(self, collection, doc):
        self.id = doc.get('id')
        doc.pop('id', None) # Prevent id and _id attributes going into MongoDB
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
        ('name', {'unique':True}),
        ('sites', {'unique':True}),
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
            return self.named(config.site_user)

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
        self['signup_group'] = config.signup_group
        assert re.match('[a-z][a-z0-9]{2,23}$', self['name']) != None, 'Invalid username'
        self.set_password(self['password'])
        self['fullname'] = self.get('fullname', self['name'])
        self['referrals'] = 0
        self['flags'] = {}
        self['email_subscriptions'] = config.default_email_subscriptions
        assert self.has_key('referrer')
        self.build_search(self)
        super(User, self).create()
        return self

    def update(self, **d):
        self.build_search(d)
        super(User, self).update(**d)
        return self

    @property
    def notification_count(self):
        count = self.get('notification_count')
        if count == None:
           count = len(self.feed)
           self['notification_count'] = count
        return count
    def notification_count_reset(self): self.update(notification_count=0)
    def notify(self, feed_item):
        self.increment({'notification_count':1})

    def expr_page(self, auth=None, tag=None, viewer=None, **args):
        spec = {'owner': self.id}
        if auth: spec.update({'auth': auth})
        if tag: spec.update({'tags_index': tag})
        if (not viewer) or (get_id(viewer) != self.id): spec.update({'auth': 'public'})
        return self.db.Expr.page(spec, viewer=viewer, **args)

    @property
    @cached
    def my_stars(self):
        """ Feed records indicating what expressions a user likes and who they're listening to """
        return self.db.Star.search({ 'initiator': self.id }, sort=[('created', -1)])
    @property
    @cached
    def starred_user_ids(self):
        return [i['entity'] for i in self.my_stars if i['entity_class'] == 'User']
    @property
    def starred_expr_ids(self): return [i['entity'] for i in self.my_stars if i['entity_class'] == 'Expr']

    def starred_user_page(self, **args): return self.collection.page(self.starred_user_ids, **args)

    @property
    @cached
    def broadcast(self): return self.db.Broadcast.search({ 'initiator': self.id })
    @property
    def broadcast_ids(self): return [i['entity'] for i in self.broadcast]

    def can_view(self, expr):
        return expr and ( (expr.get('auth', 'public') == 'public') or
                (self.id == expr['owner']) or
                (expr.id in self.starred_expr_ids) )

    def feed_profile(self, spec={}, limit=40, **args):
        def query_feed(q):
            q.update(spec)
            return list(self.feed_search(q, limit=limit, **args))
        activity = query_feed({'initiator': self.id}) + query_feed({'entity_owner': self.id})
        activity.sort(cmp=lambda x, y: cmp(x['created'], y['created']), reverse=True)
        for i, v in enumerate(activity):
            if v == lget(activity, i + 1): del activity[i]
        page = Page(activity[0:limit])
        page.next = page[-1]['created'] if len(page) == limit else None
        return page
    def feed_profile_entities(self, **args):
        res = self.feed_profile(**args)
        for i, item in enumerate(res):
            if item.type == 'FriendJoined': continue
            entity = item.initiator if item.entity.id == self.id else item.entity
            entity['feed'] = [item]
            res[i] = entity
        return res

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
        results = Page(self.feed_group(res, limit, spec=spec))
        results.next = results[-1]['feed'][-1]['created'] if len(results) == limit else None
        return results

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
        self.db.InviteNote.create(self.db.User.named(config.site_user), self, data={'count':count})

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

    def get_top_expressions(self, count=6):
        return self.get_expressions(auth='public').sort([('views', -1)]).limit(count)
    top_expressions = property(get_top_expressions)

    def get_recent_expressions(self, count=6):
        return self.get_expressions(auth='public').sort([('updated', -1)]).limit(count)
    recent_expressions = property(get_recent_expressions)

    def client_view(self, viewer=None):
        user = self.db.User.new( dfilter( self, ['_id', 'fullname', 'profile_thumb', 'thumb_file_id',
            'name', 'tags', 'updated', 'created', 'feed'] ) )
        dict.update(user, dict(
            url = self.url,
            thumb = self.get_thumb(70),
            has_thumb = self.has_thumb
        ) )
        if viewer: dict.update(user, listening = self.id in viewer.starred_user_ids )
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
        return self.get('name') in config.admins


@Database.register
class Session(Entity):
    cname = 'session'


def media_path(user, name=None):
    p = joinpath(config.media_path, user['name'])
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
        def meta(self,  username, name): return self.find({'owner_name': username, 'name': name},
            fields={ 'apps': 0, 'background': 0, 'images': 0 })

        def fetch(self, key, keyname='_id', meta=False):
            opts = dict(fields={ 'apps': 0, 'background': 0, 'images': 0 }) if meta else {}
            return super(Expr.Collection, self).fetch(key, keyname, **opts)

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
            [(port, user, name)] = re.findall(config.server_name + r'/(:\d+)?(\w+)/(.*)$', url)
            return cls.named(user, name)

        def page(self, spec, viewer, sort='updated', **opts):
            assert(sort in ['updated', 'random'])
            rs = self.paginate(spec, filter=viewer.can_view, **opts)

            # remove random static patterns from random index to make it really random
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
        return super(Expr, self).delete()

    def increment_counter(self, counter):
        assert counter in self.counters, "Invalid counter variable.  Allowed counters are " + str(self.counters)
        return self.increment({counter: 1})

    @property
    def views(self): return self.get('views', 0)

    def qualified_url(self):
      return "http://" + self['domain'] + "/" + self['name']

    def analytic_count(self, string):
      if string in ['facebook', 'gplus', 'twitter', 'stumble']:
        count = 0
        updated = 0
        try:
          updated = self['analytics'][string]['updated']
          count = self['analytics'][string]['count'] #return the value from the db if newer than 10 hours
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

    def client_view(self, viewer=None):
        return self

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
        self.store(thumb, self.id + '_' + name, 'thumb_' + name)

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

    def store(self, file, id, name):
        file.seek(0)

        if config.aws_id:
            self['protocol'] = 's3'
            self.setdefault('s3_bucket', random.choice(self.db.s3_buckets).name)
            b = self.db.s3_con.get_bucket(self['s3_bucket'])
            k = S3Key(b)
            k.name = id
            name_escaped = urllib.quote_plus(name.encode('utf8'))
            k.set_contents_from_file(file, headers = {
                'Content-Disposition': 'inline; filename=' + name_escaped,
                'Content-Type' : self['mime'],
                'Cache-Control': 'max-age=' + str(86400 * 3650)
            })
            k.make_public()
            return k.generate_url(86400 * 3600, query_auth=False)
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

        self['url'] = self.store(self._file, self.id, self['name'])
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
        self['url'] = self.store(file, self.id, self.get('name', 'untitled'))
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

    def create(self):
        if self['entity_class'] == 'User' and self.entity.owner.id == self['initiator']:
            raise "Excuse me, you mustn't listen to yourself. It is confusing."
        if self['initiator'] in self.entity.starrer_ids: return True
        return super(Star, self).create()

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

@Database.register
class Tags(Entity):
    indexes = [('tag', {'unique':True}), ('count', -1), [('count',-1),('tags',1)]]
    cname = 'tags'
    class Collection(Collection):
        def create(self, db, data={}):
            exprdb = db.Expr.search({})
            counts = getTagCnt(exprdb).most_common()
            for v in counts:
                data = {'tag': v[0],'count': v[1]}
                print data
                super(Tags.Collection, self).create(data)
            return None
        def update_tags(self):
            exprdb = self.db.Expr.search({})
            counts = getTagCnt(exprdb).most_common()
            for v in counts: 
                row = self.fetch(v[0],keyname='tag')
                if row != None:
                    if row['count'] != v[1]:
                        print row
                        row['count'] = v[1]
                        self._col.update({'tag':v[0]},row)
                        print row
                else:
                    data = {'tag': v[0],'count': v[1]}
                    print data
                    super(Tags.Collection, self).create(data)
            return None
        def delete(self):
            num = self.count()
            rows = self.search({})
            for i in range(num):
                self.entity.delete(rows[0])
            return None
        def autocomplete(self, string):
            res=self.search({'tag': {'$regex': '^'+string}}, sort=[('count',-1)])
            return res
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
        self.settings = {
          "mappings" : {
            "expr-type" : {
              "properties" : {
                "tags" : {"type" : "string", "boost":1.7, "index":"analyzed", "store": "yes", "term_vector": "with_positions_offsets", "analyzer" : "standard"},
                "text":{"type": "string", "boost":1.5, "index": "analyzed", "store": "yes", "term_vector": "with_positions_offsets"},
                "title":{"type": "string", "boost":1.7, "index": "analyzed", "store": "yes", "term_vector": "with_positions_offsets"},
                "updated":{"type": "float", "boost":1.3, "store": "yes"},
                "created":{"type": "float", "boost":1.0, "store": "yes"},
                "views":{"type": "integer", "boost":1.5, "store": "yes"}, 
                "broadcast":{"type": "integer", "boost":1.3, "store": "yes"},
                "star":{"type": "integer", "boost":1.3, "store": "yes"},  
              }
            }
          },
          "settings" : {
            "analysis" : {
              "analyzer" : {
                "default" : {"tokenizer" : "standard", "filter" : ["standard", "lowercase", "stop", "kstem"]},
                "tag_analyzer" : {"tokenizer" : "whitespace", "filter" : ["standard", "lowercase", "stop", "kstem"]}
              }
            }
          }
        }

        self.conn.indices.create_index_if_missing(index, self.settings)

        exprs = db.Expr.search({})

        for i in range(1000):
            print i
            self.update(exprs[i], refresh=False)
        self.conn.indices.refresh()
        return None

    def delete(self):
        self.conn.indices.delete_index(self.index)
        return None

    def parse_query(self, q):
        return self.db.parse_query(q)

    def create_query(self, search):
        # if query contains @username, results must match @username and one or more of the search terms
        # otherwise results match one or more of the search terms
        # query stemming disabled for phrase search

        clauses = []

        if len(search['text']) != 0:
            clauses.append(pyes.query.TextQuery('_all', ' '.join(search['text']), analyzer = 'default'))
        if len(search['tags']) != 0:
            clauses.append(pyes.query.TextQuery('tags', ' '.join(search['tags']), analyzer = 'tag_analyzer'))
        for p in search['phrases']:
            clauses.append(pyes.query.TextQuery('_all', p, type = "phrase", analyzer = 'simple'))
        if search.get('user'):
            user_clause = pyes.query.TermQuery('owner_name', search['user'])
            query = pyes.query.BoolQuery(must = user_clause, should = clauses)
        else:
            query = pyes.query.BoolQuery(should = clauses)

        return query

    def search_text(self, search, es_order, es_filter, start, limit):
        query = self.create_query(search)
        results = self.conn.search(query, indices = self.index, sort = es_order, filter = es_filter, start = start, size = limit)
        return results 

    def search_fuzzy(self, string, order="_score"):
        q = pyes.query.FuzzyLikeThisQuery(["tags", "text", "title"], string)
        results = self.conn.search(q, indices = self.index, sort = order)
        for r in results: print r
        return results

    def update(self, expr, refresh = True):
        processed_tags = ' '.join(normalize_tags(lget(expr, 'tags', '')))
        data = {
        'text': lget(expr, 'text', ''), 
        'tags': processed_tags, 
        'star': lget(lget(lget(expr, 'analytics', {}), 'Star', {}), 'count', 0),
        'broadcast': lget(lget(lget(expr, 'analytics', {}), 'Broadcast', {}), 'count', 0),
        'name': lget(expr, 'name', ''),
        'owner_name': lget(expr, 'owner_name', ''),
        'owner': lget(expr, 'owner', ''),
        'title': lget(expr, 'title', ''),
        'created': lget(expr, 'created', 0),
        'updated': lget(expr, 'updated', 0),
        'views': lget(expr, 'views', 0),
        }
        self.conn.index(data, self.index, 'expr-type', expr['_id'])
        if refresh==True: self.conn.indices.refresh()
        return None

    def paginate(self, search, limit=40, start=0, es_order='_score,views:desc', es_filter=None, sort='score'):
        res = self.search_text(search, es_order = es_order, es_filter = es_filter, start = start, limit = limit)
        expr_results = Page([])
        for r in res:
            result_id = r._meta.id
            expr_results.append(self.db.Expr.fetch(result_id))
        expr_results.next = res[limit-1]._meta[sort] if len(expr_results) == limit else None
        return expr_results