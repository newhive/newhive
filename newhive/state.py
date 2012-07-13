import re, pymongo, pymongo.objectid, random, urllib, os, mimetypes, time, getpass, exceptions, json
import operator as op
from os.path import join as joinpath
from pymongo.connection import DuplicateKeyError
from datetime import datetime
from wsgiref.handlers import format_date_time
from newhive import social_stats, config
from itertools import ifilter, islice
import PIL.Image as Img
from PIL import ImageOps
from bson.code import Code
from crypt import crypt
from oauth2client.client import OAuth2Credentials
from newhive.oauth import FacebookClient, FlowExchangeError, AccessTokenCredentialsError

from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key

from newhive.utils import now, time_s, time_u, junkstr, normalize, abs_url, memoized, uniq, bound, index_of, is_mongo_key

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

    def __init__(self, config, assets=None):
        self.config = config
        self.assets = assets

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

class Collection(object):
    def __init__(self, db, entity):
        self.db = db
        self._col = db.mdb[entity.cname]
        self.entity = entity

    def fetch_empty(self, key, keyname='_id'): return self.find_empty({ keyname : key })
    def fetch(self, key, keyname='_id', **opts): return self.find({ keyname : key }, **opts)

    def find_empty(self, spec, **opts):
        res = self.find(spec, **opts)
        return res if res else self.new({})
    def find(self, spec, **opts):
        r = self._col.find_one(spec, **opts)
        if not r: return None
        return self.new(r)

    def search(self, spec, **opts):
        return Cursor(self, self._col.find(spec=spec, **opts))

    def last(self, spec, **opts):
        opts.update({'sort' : [('_id', -1)]})
        return self.find(spec, **opts)

    def page(self, spec, limit=40, page=None, sort='updated', order=-1, viewer=None):
        if type(spec) == dict:
            if page and sort: spec[sort] = { '$lt' if order == -1 else '$gt': float(page) }
            res = self.search(spec, sort=[(sort, order)], limit=limit)
            # if there's a limit, collapse to list, get sort value of last item
            if limit:
                res = Page(list(res))
                res.next = res[-1][sort] if len(res) == limit else None
            return res

        elif type(spec) == list:
            spec = uniq(spec)
            if not page: page = '0'

            if is_mongo_key(page):
                start = spec.index(page)
                end = start + limit * -order
                if end > start:
                    if start == len(spec): return []
                    sub_spec = spec[start+1:end+1]
                else:
                    if start == 0: return []
                    if end - 1 < 0:
                        sub_spec = spec[start-1::-1]
                    else:
                        sub_spec = spec[start-1:end-1:-1]
            else:
                page = int(page)
                end = (page + 1) * limit
                sub_spec = spec[ page * limit : end ]

            items = {}
            for e in self.search({'_id': {'$in': sub_spec }}): items[e.id] = e
            res = Page()
            if type(page) == int:
                res.next = page + 1 if end <= len(spec) else None
            for i in sub_spec:
                if items.has_key(i): res.append(items[i])
            return res

    def count(self, spec): return self.search(spec).count()

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

        def mk_wrap(self, method):
            wrapped = getattr(self._cur, m)
            def wrap(*a, **b): return wrapped(*a, **b)
            return wrap
        for m in ['count', 'distinct', 'explain', 'sort']: setattr(self, m, mk_wrap(self, m))

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

    def __init__(self, col, doc):
        dict.update(self, doc)
        self.collection = col
        self._col = col._col
        self.db = col.db
        self.mdb = self.db.mdb
        self.id = doc.get('_id')

    def create(self):
        self.id = self['_id'] = str(pymongo.objectid.ObjectId())
        self['created'] = now()
        self['updated'] = now()
        self._col.insert(self, safe=True)
        return self

    def save(self): return self.update_cmd(self)

    def reload(self):
        dict.update(self, self.db.User.fetch(self.id))

    def update(self, **d):
        if not d.has_key('updated'): d['updated'] = now()
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
    # TODO: remove this after migration for deleting feed attribute
    def __init__(self, col, doc):
        if doc.has_key('feed'): del doc['feed']
        super(HasSocial, self).__init__(col, doc)

    @property
    @memoized
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
    @memoized
    def broadcast_count(self):
        return self.db.Broadcast.search({ 'entity': self.id }).count()

@Database.register
class KeyWords(Entity):
    cname = 'key_words'
    indexes = [ ['doc_type', 'weight', 'words'], 'doc']

    class Collection(Collection):
        def remove_entries(self, doc):
            self._col.remove({'doc' : doc.id })

        def set_words(self, doc, texts, updated):
            """ Takes a dictionary of { weight : text } pairs """

    #        assert(type(doc) in classes.values())
            self.remove_entries(doc)
            all = set()
            for (weight, text) in texts.items():
                if text:
                    words = normalize(text)
                    all = all.union(words)
                    self._col.insert({ 'updated': updated, 'words':words, 'weight':weight, 'doc':doc.id, 'doc_type':doc.__class__.__name__ })
            self._col.insert({ 'updated': updated, 'words':list(all), 'weight':'all', 'doc':doc.id, 'doc_type':doc.__class__.__name__ })

        def init(self, doc):
            return classes[doc['doc_type']](doc)

        def text_search(self, text, weight='all', doc_type='Expr', **args):
            words = normalize(text)
            cursor = self.search({'words': {'$all': words}, 'weight': weight, 'doc_type': doc_type}).sort([('updated', -1)])
            return cursor

        def search_page(self, text, doc_type=None, weight='all', **args):
            words = normalize(text)
            spec = {'words': {'$all': words}, 'weight': weight }
            if doc_type: spec.update({'doc_type': doc_type})
            return self.page(spec, **args)


@Database.register
class User(HasSocial):
    cname = 'user'
    indexes = [ ('updated', -1), ('name', {'unique':True}), ('sites', {'unique':True}), 'facebook.id' ]
    
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
        self['owner'] = self.id

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
        assert self.has_key('referrer')
        super(User, self).create()
        self.build_search_index()
        return self

    def update(self, **d):
        super(User, self).update(**d)
        self.build_search_index()
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
    @memoized
    def my_stars(self):
        """ Feed records indicating what expressions a user likes and who they're listening to """
        return self.db.Star.search({ 'initiator': self.id }, sort=[('created', -1)])
    @property
    def starred_user_ids(self): return [i['entity'] for i in self.my_stars if i['entity_class'] == 'User']
    @property
    def starred_expr_ids(self): return [i['entity'] for i in self.my_stars if i['entity_class'] == 'Expr']

    def starred_user_page(self, **args): return self.collection.page(self.starred_user_ids, **args)

    @property
    @memoized
    def broadcast(self): return self.db.Broadcast.search({ 'initiator': self.id })
    @property
    def broadcast_ids(self): return [i['entity'] for i in self.broadcast]

    def can_view(self, expr):
        return expr and ( (expr.get('auth', 'public') == 'public') or
            (self.id == expr['owner']) or (expr.id in self.starred_expr_ids) )

    def feed_profile(self, spec={}, limit=40, **args):
        def query_feed(q):
            q.update(spec)
            return list(self.feed_search(q, limit=limit, **args))
        activity = query_feed({'initiator': self.id}) + query_feed({'entity_owner': self.id})
        activity.sort(cmp=lambda x, y: cmp(x['created'], y['created']), reverse=True)
        page = Page(activity[0:limit])
        page.next = page[-1]['created'] if len(page) == limit else None
        return page
    def feed_profile_entities(self, **args):
        res = self.feed_profile(**args)
        for i, item in enumerate(res):
            if item.type == 'SystemMessage' or item.type == 'FriendJoined': continue
            entity = item.initiator if item.entity.id == self.id else item.entity
            entity.feed = [item]
            res[i] = entity
        return res

    def feed_network(self, limit=40, **args):
        res = self.feed_search({ '$or': [
            { 'initiator': {'$in': self.starred_user_ids}, 'class_name': {'$in': ['NewExpr', 'Broadcast']} }
            ,{ 'initiator': self.id, 'class_name': 'Broadcast' }
            ,{ 'entity': {'$in': self.starred_expr_ids}, 'class_name': {'$in':['Comment', 'UpdatedExpr']},
                'initiator': { '$ne': self.id } }
        ] } , auth='public', **args)
        page = Page(self.feed_group(res, limit))
        page.next = page[-1].feed[-1]['created'] if len(page) == limit else None
        return page

    def feed_search(self, spec, viewer=None, auth=None, limit=None, **args):
        if type(viewer) != User: viewer = self.db.User.fetch_empty(viewer)
        res = self.db.Feed.page(spec, limit=0, sort='created', **args)
        if auth: res = ifilter(lambda i: i.entity and i.entity.get('auth', auth) == auth, res)
        res = ifilter(lambda i: i.viewable(viewer) and viewer.can_view(i.entity), res)
        if limit: res = islice(res, limit)
        return res

    def feed_group(self, res, limit, feed_limit=6):
        """" group feed items by expression """
        exprs = []
        for item in res:
            i = index_of(exprs, lambda e: e.id == item['entity'])
            if i == -1:
                item.entity.feed = [item]
                exprs.append(item.entity)
            elif len(exprs[i].feed) < feed_limit:
                if index_of(exprs[i].feed, lambda e: e['initiator'] == item['initiator']) != -1: continue
                exprs[i].feed.append(item)
            if len(exprs) == limit: break
        return exprs

    def build_search_index(self):
        texts = {'name': self.get('name'), 'fullname': self.get('fullname')}
        self.db.KeyWords.set_words(self, texts, updated=self.get('updated'))

    def new_referral(self, d, decrement=True):
        if self.get('referrals', 0) > 0 or self == self.db.User.root_user or self == self.db.User.site_user:
            if decrement: self.increment({ 'referrals': -1 })
            d.update(user = self.id)
            return self.db.Referral.create(d)
    def give_invites(self, count):
        self.increment({'referrals':count})
        self.db.InviteNote.create(self.db.User.named(config.site_user), self, data={'count':count})

    def cmp_password(self, v):
        return crypt(v.encode('UTF8'), self['password']) == self['password']

    def set_password(self, v):
        salt = "$6$" + junkstr(8)
        self['password'] = crypt(v.encode('UTF8'), salt)
    def update_password(self, v):
        self.set_password(v)
        self.update(password=self['password'])

    def get_url(self, path='profile'):
        return abs_url() + self.get('name', '') + '/' + path
    url = property(get_url)

    def has_thumb(self):
        id = self.get('thumb_file_id')
        url = self.get('profile_thumb')
        return (id and id != '') or (url and url != '')

    def get_thumb(self, size=190):
        if self.get('thumb_file_id'):
            file = self.db.File.fetch(self['thumb_file_id'])
            if file:
                thumb = file.get_thumb(size,size)
                if thumb: return thumb
        return self.get('profile_thumb') or self.db.assets.url('skin/1/thumb_person_mask.png')
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

    def delete(self):
        for e in self.db.Expr.search({'owner': self.id}): e.delete()
        self.db.KeyWords.remove_entries(self)
        for e in self.my_stars: e.delete()
        return super(User, self).delete()

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

    @property
    def expressions(self): return self.get_exprs()

    def delete(self):
        # Facebook Disconnect
        self.facebook_disconnect()

        # Expressions Cleanup
        for e in self.expressions:
            e.delete()

        # Search Index Cleanup
        self.db.KeyWords.remove_entries(self)

        # Feed Cleanup
        for feed_item in self.db.Feed.search({'$or': [{'initiator': self.id}, {'entity': self.id}]}):
            feed_item.delete()

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


@Database.register
class Session(Entity):
    cname = 'session'


def media_path(user, f_id=None):
    p = joinpath(config.media_path, user['name'])
    return joinpath(p, f_id) if f_id else p

@Database.register
class Expr(HasSocial):
    cname = 'expr'
    indexes = [
         (['owner_name', 'name'], {'unique':True})
        ,['owner', 'updated']
        ,'domain'
        ,'tags_index'
        ,'updated'
        ,'random'
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
            [(domain, port, name)] = re.findall(r'//(.*?)(:\d+)?/(.*)$', url)
            return cls.named(domain, name)

        def page(self, spec, viewer=None, **opts):
            if type(viewer) != User: viewer = self.db.User.fetch_empty(viewer)
            es = super(Expr.Collection, self).page(spec, **opts)
            es[:] = filter(lambda e: viewer.can_view(e), es)
            return es

        def random(self):
            rand = random.random()
            return self.find(dict(random = {'$gte': rand}, auth='public', apps={'$exists': True}))

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

    def build_search_index(self):
        texts = {
                'tags': self.get('tags')
                , 'title': self.get('title')
                }
        self.db.KeyWords.set_words(self, texts, updated=self.get('updated'))

    def update_tags(self, d={}):
        upd = {}
        tags = d.get('tags') or self.get('tags', '')
        if tags: upd['tags_index'] = normalize(tags)
        dict.update(self, upd)
        return upd

    def update(self, **d):
        d.update(self.update_tags(d))
        super(Expr, self).update(**d)
        last_update = self.db.UpdatedExpr.last({ 'initiator' : self['owner'] })
        if not last_update or now() - last_update['created'] > 14400:
            feed = self.db.UpdatedExpr.create(self.owner, self)
        self.owner.get_expr_count(force_update=True)
        self.build_search_index()
        return self

    def create(self):
        assert map(self.has_key, ['owner', 'domain', 'name'])
        self['owner_name'] = self.db.User.fetch(self['owner'])['name']
        self['domain'] = self['domain'].lower()
        self['random'] = random.random()
        self.setdefault('title', 'Untitled')
        self.setdefault('auth', 'public')
        self.update_tags()
        super(Expr, self).create()
        feed = self.db.NewExpr.create(self.owner, self)
        self.owner.get_expr_count(force_update=True)
        self.build_search_index()
        return self

    def delete(self):
        self.owner.get_expr_count(force_update=True)
        self.db.KeyWords.remove_entries(self)
        return super(Expr, self).delete()

    def increment_counter(self, counter):
        assert counter in self.counters, "Invalid counter variable.  Allowed counters are " + str(self.counters)
        return self.increment({counter: 1})

    @property
    def views(self):
        if self.has_key('views'):
            if self.has_key('owner_views'):
                return self['views'] - self['owner_views']
            else:
                return self['views']
        else:
            return 0

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

    @property
    def url(self): return abs_url() + self['owner_name'] + '/' + self['name']

    @property
    def owner_url(self): return abs_url(domain = self.get('domain')) + 'profile'

    def get_thumb(self, size=190):
        if self.get('thumb_file_id'):
            file =  self.db.File.fetch(self['thumb_file_id'])
            if file:
                thumb = file.get_thumb(size,size)
                if thumb: return thumb
        thumb = self.get('thumb')
        if not thumb: thumb = self.db.assets.url('skin/1/thumb_0.png')
        return thumb + '?v=2'
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

    def get_feed(self, **opts):
        return self.db.Feed.search({ 'entity': self.id,
            'class_name': {'$in': ['Star', 'Comment', 'Broadcast']} }, **opts)

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

    public = property(lambda self: self.get('auth') == "public")


def generate_thumb(file, size):
    # resize and crop image to size tuple, preserving aspect ratio, save over original
    try:
        file.seek(0)
        imo = Img.open(file)
    except:
        print "failed to opem image file " + str(file)
        return False
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
    _file = None #temporary path

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
            print 'urlopen fail: ' + self['url']
            return False
        if response.getcode() != 200:
            print 'http fail ' + str(response.getcode()) + ': ' + self['url']
            return False
        self._file = os.tmpfile()
        self._file.write(response.read())
        return True

    def set_thumb(self, w, h, file=False):
        name = str(w) + 'x' + str(h)
        if not (self._file or file): self.download()
        if not file: file = self._file

        thumb = generate_thumb(file, (w,h))
        self.store_aws(thumb, self.id + '_' + name, 'thumb_' + name)

        thumbs = self.get('thumbs')
        if not thumbs: thumbs = self['thumbs'] = {}
        version = int(thumbs.get(name, 0)) + 1
        thumbs[name] = version
        url = "%s_%s?v=%s" % (self['url'], name, version)
        self.update(thumbs=thumbs)
        return {'url': url, 'file': thumb}

    def get_thumb(self, w, h, generate=False):
        name = str(w) + 'x' + str(h)
        if not self.get('thumbs', {}).get(name):
            if not generate: return False
            else: return set_thumb(w,h)['url']

        return "%s_%s%s" % (self['url'].split('?')[0], name, ('?v=' + str(self['thumbs'][name])) if type(self['thumbs'][name]) == int else '')

    def get_default_thumb(self):
        return self.get_thumb(190,190)
    default_thumb = property(get_default_thumb)


    def store_aws(self, file, id, name):
        file.seek(0)
        b = self.db.s3_con.get_bucket(self.get('s3_bucket', random.choice(self.db.s3_buckets).name))
        k = S3Key(b)
        k.name = id
        k.set_contents_from_file(file, headers={ 'Content-Disposition' : 'inline; filename=' + name,
            'Content-Type' : self['mime'], 'Cache-Control': 'max-age=' + str(86400 * 3650) })
        k.make_public()
        return k.generate_url(86400 * 3600, query_auth=False)

    def create(self):
        """ Uploads file to s3 if config.aws_id is defined, otherwise
        saves in config.media_path
        """

        self._file = self['tmp_file']
        del self['tmp_file']
        super(File, self).create()
        self['owner']

        # Image optimization
        if self['mime'] in ['image/jpeg', 'image/png', 'image/gif']:
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

        url = None
        if config.aws_id:
            dict.update(self, s3_bucket=random.choice(config.s3_buckets))
            url = self.store_aws(self._file, self.id, urllib.quote_plus(self['name'].encode('utf8')))
            dict.update(self, url=url)
            if self['mime'] in ['image/jpeg', 'image/png', 'image/gif']:
                thumb190 = self.set_thumb(190,190)['file']
                self.set_thumb(70,70, file=thumb190)
        else:
            owner = self.db.User.fetch(self['owner'])
            name = self.id + mimetypes.guess_extension(mime)
            fs_path = media_path(owner) + '/' + name
            f = open(fs_path, 'w')
            self._file.seek(0)
            f.write(self._file.read())
            f.close()
            url = abs_url() + 'file/' + owner['name'] + '/' + name

        self.update(url=url, s3_bucket=self.get('s3_bucket'))
        return self

    def delete(self):
        if self.get('s3_bucket'):
            k = self.db.s3_con.get_bucket(self['s3_bucket']).get_key(self.id)
            if k: k.delete()
        elif self.get('fs_path'): os.remove(self['fs_path'])

        super(File, self).delete()


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
        if self.entity['owner'] != self['initiator']: self.entity.owner.notify(self)

        return self

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
        return 'likes' if self['entity_class'] == 'Expr' else 'listening'

    def create(self):
        if self['entity_class'] == 'User' and self.entity['owner'] == self['initiator']:
            raise "You mustn't listen to yourself. It is confusing."
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

@Database.register
class FriendJoined(Feed):
    def viewable(self, viewer):
        return self['entity'] == viewer.id

    def create(self):
        if self.db.FriendJoined.find({ 'initiator': self['initiator'], 'entity': self['entity'] }): return True
        return super(FriendJoined, self).create()

@Database.register
class SystemMessage(Feed):
    class Collection(Feed.Collection):
        def create(self, entity, data={}):
            initiator = self.db.User.get_root()
            return super(SystemMessage.Collection, self).create(initiator, entity, data)


@Database.register
class Referral(Entity):
    cname = 'referral'
    indexes = [ 'key', 'request_id' ]

    def create(self):
        self['key'] = junkstr(16)
        return super(Referral, self).create()

    @property
    def url(self):
        url = abs_url(secure=True) + 'signup?key=' + self.get('key')
        if self.get('email'): url += '&email=' + self['email']
        return url


@Database.register
class Contact(Entity):
    cname = 'contact_log'

@Database.register
class ErrorLog(Entity):
    cname = 'error_log'
    indexes = ['created']

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

def count(L):
    c = {}
    for v in L: c[v] = c.get(v, 0) + 1
    return sorted([(c[v], v) for v in c])
