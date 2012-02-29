import re, pymongo, pymongo.objectid, random, urllib, os, mimetypes, time, getpass, exceptions, json
from os.path import join as joinpath
from pymongo.connection import DuplicateKeyError
from datetime import datetime
from newhive import social_stats, config
import PIL.Image as Img
from PIL import ImageOps
from bson.code import Code
from crypt import crypt
from itertools import ifilter, imap
from oauth2client.client import OAuth2Credentials
from newhive.oauth import FacebookClient

from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key

from newhive.utils import now, time_s, time_u, junkstr, normalize, abs_url


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

        self.con = pymongo.Connection()
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

    def fetch(self, key, keyname='_id'):
        return self.find({keyname : key })

    def find(self, spec, **opts):
        r = self._col.find_one(spec, **opts)
        if not r: return None
        return self.entity(self, r)

    def search(self, spec, **opts):
        return Cursor(self, self._col.find(spec=spec, **opts))

    def last(self, spec, **opts):
        opts.update({'sort' : [('_id', -1)]})
        return self.find(spec, **opts)

    def list(self, spec, limit=300, page=0, sort='updated'):
        if type(spec) == dict:
            return self.search(spec, sort=[(sort, -1)], limit=limit, skip=limit * page)
        elif type(spec) == list:
            items = dict([[item.id, item] for item in self.search({'_id': {'$in': spec}})])
            return [items.get(s) for s in spec]

    def count(self, spec): return self.search(spec).count()

    def new(self, d): return self.entity(self, d)
    def create(self, d):
        new_entity = self.entity(self, d)
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

    def __getitem__(self, index): return self.collection.entity(self.collection, self._cur.__getitem__(index))
    def next(self): return self.collection.entity(self.collection, self._cur.next())
    def __iter__(self): return self

class Entity(dict):
    """Base-class for very simple wrappers for MongoDB collections"""
    
    indexes = []
    Collection = Collection
    _starred_items = _starrers = _commenters = _feed = None

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
        if d.has_key('updated'): del d['updated']
        else: d['updated'] = now()
        dict.update(self, d)
        return self._col.update({ '_id' : self.id }, { '$set' : d })
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

    def get_feed(self):
        if not self._feed:
            feed = self.get('feed')
            if feed:
                self._feed = list(self.db.Feed.search({ '_id': { '$in' : self.get('feed') } }))
            else:
                self._feed = []
        return self._feed
    feed = property(get_feed)

    def get_recent_feed(self):
        return self.feed[-5:]
    recent_feed = property(get_recent_feed)

    def set_notification_count(self, count):
        self.update_cmd({'$set': {'notification_count': count}});
    def get_notification_count(self):
        count = self.get('notification_count')
        if not count and count != 0:
           count = len(self.feed)
           self.notification_count = count
        return count
    notification_count = property(get_notification_count, set_notification_count)

    def get_starred_items(self):
        if not self._starred_items:
          self._starred_items = [item.get('entity') for item in filter(lambda i: i.get('class_name') == 'Star' and i.get('initiator') == self.id, self.feed)]
        return self._starred_items
    starred_items = property(get_starred_items)

    def get_starrers(self):
        if not self._starrers:
          self._starrers = [item.get('initiator') for item in filter(lambda i: i.get('class_name') == 'Star' and i.get('entity') == self.id, self.feed)]
        return self._starrers
    starrers = property(get_starrers)

    def get_commenters(self):
        if not self._commenters:
          self._commenters = [item.get('initiator') for item in filter(lambda i: i.get('class_name') == 'Comment' and i.get('entity') == self.id, self.feed)]
        return self._commenters
    commenters = property(get_commenters)

    def get_star_count(self):
        return len(self.starrers)
    star_count = property(get_star_count)

    def get_comment_count(self):
        return len(self.commenters)
    comment_count = property(get_comment_count)

    def notify(self, type, feed_item_id):
        notifyees = getattr(self, type)
        return self.mdb.user.update({"_id": {"$in": notifyees}}, {'$addToSet': {'feed': feed_item_id}}, safe=True)

    def related_next(self, spec={}, loop=True):
        if type(spec) == dict:
            shared_spec = spec
            try:
                spec = {'updated':{'$lt': self['updated']}}
                spec.update(shared_spec)
                cur = self._col.find(spec).sort([('updated', -1)]).limit(1)
                return self.collection.new(cur[0])
            except IndexError:
                if loop:
                    try: return self.collection.new(self._col.find(shared_spec).sort([('updated', -1)]).limit(1)[0])
                    except IndexError: return None
                else: return None
        elif type(spec) == list:
            try: index = spec.index(self.id)
            except ValueError: return None #in this case the expression isn't in the collection to begin with

            try: return self.db.Expr.fetch(spec[index+1])
            except IndexError:
                if loop: return self.db.Expr.fetch(spec[0])
                else: return None
        else: raise "argument must be a mongodb spec dicionary or a list of object ids"

    def related_prev(self, spec={}, loop=True):
        if type(spec) == dict:
            shared_spec = spec
            try:
                spec = {'updated':{'$gt': self['updated']}}
                spec.update(shared_spec)
                cur = self._col.find(spec).sort([('updated', 1)]).limit(1)
                return self.collection.new(cur[0])
            except IndexError:
                if loop:
                    try: return self.collection.new(self._col.find(shared_spec).sort([('updated',1)]).limit(1)[0])
                    except IndexError: return None
                else: return None
        elif type(spec) == list:
            try: index = spec.index(self.id)
            except ValueError: return None #in this case the expression isn't in the collection to begin with

            try: return self.db.Expr.fetch(spec[index-1])
            except IndexError:
                if loop: return self.db.Expr.fetch(spec[-1])
                else: return None
        else: raise "argument must be a mongodb spec dicionary or a list of object ids"


@Database.register
class KeyWords(Entity):
    cname = 'key_words'
    indexes = [ ['doc_type', 'weight', 'words'], 'doc']
    #classes = { 'Expr' : Expr, 'User' : User }

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

        def text_search(self, text, weight='all', doc_type='Expr'):
            words = normalize(text)
            cursor = self.search({'words': {'$all': words}, 'weight': weight, 'doc_type': doc_type}).sort([('updated', -1)])
            return cursor


@Database.register
class User(Entity):
    cname = 'user'

    indexes = [ ('name', {'unique':True}), 'facebook.id' ]
    
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
        def get_root(self): return self.named('root')
        root_user = property(get_root)

        @property
        def site_user(self):
            return self.named(config.site_user)

    def __init__(self, *a, **b):
        super(User, self).__init__(*a, **b)
        self.logged_in = False

    def expr_create(self, d):
        doc = dict(owner = self.id, name = '', domain = self['sites'][0])
        doc.update(d)
        return self.db.Expr.create(doc)

    def create(self):
        self['name'] = self['name'].lower()
        self['signup_group'] = config.signup_group
        assert re.match('[a-z][a-z0-9]{2,}$', self['name']) != None, 'Invalid username'
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

    def build_search_index(self):
        texts = {'name': self.get('name'), 'fullname': self.get('fullname')}
        self.db.KeyWords.set_words(self, texts, updated=self.get('updated'))

    def new_referral(self, d, decrement=True):
        if self.get('referrals', 0) > 0 or self == self.db.User.root_user or self == self.db.User.site_user:
            if decrement:
                self.update(referrals=self['referrals'] - 1)
            d.update(user = self.id)
            return self.db.Referral.create(d)
    def give_invites(self, count):
        self.increment({'referrals':count})
        self.db.InviteNote.new(self.db.User.named(config.site_user), self, data={'count':count})

    def cmp_password(self, v):
        return crypt(v, self['password']) == self['password']

    def set_password(self, v):
        salt = "$6$" + junkstr(8)
        self['password'] = crypt(v, salt)

    def get_url(self, path='expressions'):
        return abs_url(domain = self.get('sites', [config.server_name])[0]) + path
    url = property(get_url)

    def get_thumb(self):
        if self.get('thumb_file_id'):
            file = self.db.File.fetch(self['thumb_file_id'])
            if file:
                thumb = file.get_thumb(190,190)
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
            count = self.set_expr_count
        else:
            try:
                count = self['analytics']['expressions']['count']
            except KeyError:
                count = self.set_expr_count
        return count
    expr_count = property(get_expr_count)

    def _has_homepage(self):
        return bool(self.mdb.expr.find({'owner': self.id, 'apps': {'$exists': True}, 'name': ''}).count())
    has_homepage = property(_has_homepage)

    @property
    def key_words(self):
        return list(set(normalize(' '.join([self['name'], self['fullname']]))))

    @property
    def facebook_credentials(self):
        if not hasattr(self, '_facebook_credentials'):
            if self.has_key('oauth') and self['oauth'].has_key('facebook'):
                self._facebook_credentials = OAuth2Credentials.from_json(
                                                    json.dumps(self['oauth']['facebook']))
            else: return None
        return self._facebook_credentials

    def save_credentials(self, request, fbc=FacebookClient()):
        credentials = fbc.exchange(request)
        if not self.has_key('oauth'): self['oauth'] = {}
        if not self.has_key('facebook'):
            self['facebook'] = fbc.find('https://graph.facebook.com/me')
        self['oauth']['facebook'] = json.loads(credentials.to_json())
        self.save()

    @property
    def facebook_id(self):
        if self.has_key('facebook'): return self['facebook'].get('id')
    @property
    def facebook_thumbnail(self):
        if self.has_key('facebook'):
            return "https://graph.facebook.com/" + self.facebook_id + "/picture?type=square"

    def facebook_disconnect(self):
        if self.facebook_credentials and not self.facebook_credentials.access_token_expired:
            fbc = FacebookClient()
            fbc.delete('https://graph.facebook.com/me/permissions', self.facebook_credentials)
        self.update_cmd({'$unset': {'facebook': 1, 'oauth.facebook': 1}})

    def get_facebook_friends(self, fbc=None):
        if not fbc:
            if not self.facebook_credentials or self.facebook_credentials.access_token_expired:
                return None
            fbc = FacebookClient()
            fbc.credentials = self.facebook_credentials
        friends = fbc.fql("""SELECT name,uid FROM user WHERE is_app_user = '1' AND uid IN (SELECT uid2 FROM friend WHERE uid1 =me())""")['data']
        return self.db.User.search({'facebook.id': {'$in': [str(friend['uid']) for friend in friends]}})

    @property
    def expressions(self):
        return self.db.Expr.search({'owner': self.id})

    def delete(self):
        # Expressions Cleanup
        for e in self.expressions:
            e.delete()

        # Search Index Cleanup
        self.db.KeyWords.remove_entries(self)

        # Feed Cleanup
        for feed_item in self.db.Feed.search({'$or': [{'initiator': self.id}, {'entity': self.id}]}):
            feed_item.delete()

        return super(User, self).delete()


@Database.register
class Session(Entity):
    cname = 'session'


def media_path(user, f_id=None):
    p = joinpath(config.media_path, user['name'])
    return joinpath(p, f_id) if f_id else p

@Database.register
class Expr(Entity):
    cname = 'expr'
    indexes = [
         (['domain', 'name'], {'unique':True})
        ,['owner', 'updated']
        ,'updated'
        ,'tags_index'
        ,'random'
    ]
    counters = ['owner_views', 'views', 'emails']
    _owner = None

    class Collection(Collection):
        def named(self, domain, name): return self.find({'domain' : domain, 'name' : name})

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

        def list(self, spec, requester=None, context_owner=None, **opts):
            es = super(Expr.Collection, self).list(spec, **opts)
            can_view = lambda e: (
                requester == e['owner'] or (requester in e.starrers and context_owner == requester) or (e.get('auth', 'public') == 'public' and len(e.get('apps', [])) )
                )
            return ifilter(can_view, es)

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
            shared_spec.update({'auth': 'public'})
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

    def update_tags(self):
        if self.get('tags'): self['tags_index'] = normalize(self['tags'])

    def update(self, **d):
        self.update_tags()
        super(Expr, self).update(**d)
        last_update = self.db.UpdatedExpr.last({ 'initiator' : self['owner'] })
        if not last_update or now() - last_update['created'] > 14400:
            feed = self.db.UpdatedExpr.new(self.owner, self)
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
        feed = self.db.NewExpr.new(self.owner, self)
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

    def get_url(self): return abs_url(domain=self['domain']) + self['name']
    url = property(get_url)

    def get_owner_url(self): return abs_url(domain = self.get('domain')) + 'expressions'
    owner_url = property(get_owner_url)

    def get_thumb(self):
        if self.get('thumb_file_id'):
            file =  self.db.File.fetch(self['thumb_file_id'])
            if file:
                thumb = file.get_thumb(190,190)
                if thumb: return thumb
        thumb = self.get('thumb')
        if not thumb: thumb = abs_url() + '/lib/skin/1/thumb_0.png'
        thumb = re.sub('https?://thenewhive.com(:\d+)?', abs_url(), thumb) + '?v=2'
        return thumb
    thumb = property(get_thumb)

    def set_tld(self, domain):
        """ Sets the top level domain (everything following first dot) in domain attribute """
        return self.update(updated=False, domain=re.sub(r'([^.]+\.[^.]+)$', domain, self['domain']))

    def get_comments(self):
        if not self.has_key('feed'): return []
        comments = self.db.Comment.search({ '_id': {'$in': self['feed']} })
        try:
            comments_accurate = len(comments) == self['analytics']['Comment']['count']
        except KeyError:
            comments_accurate = False
        if not comments_accurate:
            self.update_cmd({'$set': {'analytics.Comment.count': len(comments)}})
        return comments
    comments = property(get_comments)

    def get_comment_count(self):
        try:
            return self['analytics']['Comment']['count']
        except KeyError:
            return 0
    comment_count = property(get_comment_count)


    def get_share_count(self):
        count = 0
        for item in ["email", "gplus", "twitter", "facebook"]:
            count += self.analytic_count(item)
        return count
    share_count = property(get_share_count)

    public = property(lambda self: self.get('auth') == "public")

    @property
    def key_words(self):
        return list(set(normalize(' '.join([self['tags'], self['title'], self['name']]))))


def generate_thumb(file, size):
    # resize and crop image to size tuple, preserving aspect ratio, save over original
    try:
        file.seek(0)
        imo = Img.open(file)
    except:
        print "failed to opem image file " + str(file)
        return False
    print "Thumbnail Generation:   initial size: " + str(imo.size),
    t0 = time.time()
    imo = ImageOps.fit(imo, size=size, method=Img.ANTIALIAS, centering=(0.5, 0.5))
    if imo.mode != 'RGB':
        bg = Img.new("RGBA", imo.size, (255,255,255))
        imo = imo.convert(mode='RGBA')
        imo = Img.composite(imo, bg, imo)
    dt = time.time() - t0
    print "   final size:   " + str(imo.size),
    print "   conversion took " + str(dt*1000) + " ms"

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
        b = self.db.s3_con.get_bucket(self.get('s3_bucket', random.choice(self.db.s3_buckets).name))
        k = S3Key(b)
        k.name = id
        k.set_contents_from_file(file,
            headers={ 'Content-Disposition' : 'inline; filename=' + name, 'Content-Type' : self['mime'] })
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
                self.set_thumb(124,96)
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

        self.update(url=url)
        return self

    def delete(self):
        if self.get('s3_bucket'):
            k = self.db.s3_con.get_bucket(self['s3_bucket']).get_key(self.id)
            if k: k.delete()
        elif self.get('fs_path'): os.remove(self['fs_path'])

        super(File, self).delete()


@Database.register
class ActionLog(Entity):
    cname = 'action_log'

    class Collection(Collection):
        def new(self, user, action, data={}):
            data.update({
                'user': user.id
                ,'user_name': user.get('name')
                ,'action': action
                })
            return self.create(data)


@Database.register
class Feed(Entity):
    cname = 'feed'
    indexes = ['entity', 'initiator']
    _initiator = _entity = None

    class Collection(Collection):
        def new(self, initiator, entity, data={}):
            data.update({
                'initiator': initiator.id
                ,'initiator_name': initiator.get('name')
                ,'entity': entity.id
                ,'entity_class': entity.__class__.__name__
                })
            return self.create(data)

        def search(self, spec):
            if not self.entity == Feed: spec.update(class_name=self.entity.__name__)
            return super(Feed.Collection, self).search(spec)

        def last(self, spec):
            spec.update(class_name=self.entity.__name__)
            return super(Feed.Collection, self).last(spec)

    def create(self):
        for key in ['initiator', 'entity', 'entity_class']:
            assert self.has_key(key)

        class_name = type(self).__name__
        self.update(class_name=class_name)
        super(Feed, self).create()
        self.mdb.user.update({'_id': self['initiator']}, {'$addToSet': {'feed': self.id}})
        self.entity.update_cmd({'$addToSet': {'feed': self.id}})
        self.entity.update_cmd({'$inc': {'analytics.' + class_name + '.count': 1}})
        if self['entity_class'] == "Expr":
            if not self.entity['owner'] == self['initiator']: # don't double-count commenting on your own expression
                self.mdb.user.update({'_id': self.entity['owner']}, {'$inc': {'notification_count': 1}, '$addToSet': {'feed': self.id}})
        return self

    def get_entity(self):
        if not self._entity:
            self._entity = getattr(self.db, self['entity_class']).fetch(self['entity'])
        return self._entity

    def get_initiator(self):
        if not self._initiator:
            self._initiator = self.db.User.fetch(self['initiator'])
        return self._initiator

    entity = property(get_entity)
    initiator = property(get_initiator)
        
    def delete(self):
        if self.initiator: self.initiator.update_cmd({'$pull': {'feed': self.id}})
        if self.entity: self.entity.update_cmd({'$pull': {'feed': self.id}})
        return super(Feed, self).delete()

    def get_owner_name(self):
      if self['entity_class'] == "User":
        return self.entity.get('name')
      elif self['entity_class'] == "Expr":
        return self.entity.get('owner_name')
    owner_name = property(get_owner_name)

    def get_owner_url(self):
      if self['entity_class'] == "User":
        return self.entity.url
      elif self['entity_class'] == "Expr":
        return abs_url(domain = self.entity.get('domain')) + "expressions"
    owner_url = property(get_owner_url)

@Database.register
class Comment(Feed):
    def create(self):
        assert self.has_key('text')
        super(Comment, self).create()
        self.entity.notify('commenters', self.id)
        self.entity.notify('starrers', self.id)
        return self

    def get_author(self):
        author = self.get('initiator_name')
        if not author:
            author = self.initiator['name']
            self.update_cmd({'$set': {'initiator_name': author}})
        return author
    author = property(get_author)

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
    class Collection(Feed.Collection):
        def new(self, initiator, entity, data={}):
            #TODO: fix inconsistent behavior when feed is improperly deleted and exists in entity's feed but not initiator's
            if initiator.id in entity.starrers:
                return True
            else:
                return super(Star.Collection, self).new(initiator, entity, data)

@Database.register
class InviteNote(Feed):
    def create(self):
        super(InviteNote, self).create()
        self.entity.increment({'notification_count': 1})
        return self

@Database.register
class NewExpr(Feed):
    def create(self):
        super(NewExpr, self).create()
        if self.entity.public:
            self.entity.owner.notify('starrers', self.id)
        return self

@Database.register
class UpdatedExpr(Feed):
    def create(self):
        super(UpdatedExpr, self).create()
        self.entity.notify('starrers', self.id)
        if self.entity.public:
            self.entity.owner.notify('starrers', self.id)
        return self


@Database.register
class Referral(Entity):
    cname = 'referral'

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
