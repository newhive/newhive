import re, pymongo, pymongo.objectid, random, urllib, os, mimetypes
from os.path import join as joinpath
from pymongo.connection import DuplicateKeyError
from datetime import datetime
import config
import social_stats

from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key


con = None
db = None
s3_con = None
s3_buckets = None

con = pymongo.Connection()
db = con[config.database]

# initialize s3 connection
if config.aws_id:
    s3_con = S3Connection(config.aws_id, config.aws_secret)
    s3_buckets = map(lambda b: s3_con.create_bucket(b), config.s3_buckets)

def init_connections(config):
    con = pymongo.Connection()
    db = con[config.database]

    # initialize s3 connection
    if config.aws_id:
        s3_con = S3Connection(config.aws_id, config.aws_secret)
        s3_buckets = map(lambda b: s3_con.create_bucket(b), config.s3_buckets)


def now(): return time_s(datetime.utcnow())
def time_s(t): return int(t.strftime('%s'))
def time_u(t): return datetime.utcfromtimestamp(t)
def guid(): return str(pymongo.objectid.ObjectId())

def junkstr(length):
    """Creates a random base 64 string"""

    def chrange(c1, c2): return [chr(i) for i in range(ord(c1), ord(c2)+1)]
    chrs = chrange('0', '9') + chrange('A', 'Z') + chrange('a', 'z') + ['.', '/']
    return ''.join([chrs[random.randrange(0, 64)] for _ in range(length)])


class Entity(dict):
    """Base-class for very simple wrappers for MongoDB collections"""

    def __init__(self, d, cname=None):
        dict.update(self, d)
        if cname: self.cname = cname
        self._col = db[self.cname]
        self.id = d.get('_id')

    @classmethod
    def fetch(cls, *a, **b):
        self = cls({})
        return self.fetch_me(*a, **b)
    def fetch_me(self, key, keyname='_id'):
        return self.find_me(**{ keyname : key })

    @classmethod
    def find(cls, **spec):
        self = cls({})
        return self.find_me(**spec)
    def find_me(self, **spec):
        r = self._col.find_one(spec)
        if not r: return None
        dict.update(self, r)
        self.id = self['_id']
        return self

    @classmethod
    def search(cls, **spec):
        self = cls({})
        return map(cls, self._col.find(spec=spec))

    @classmethod
    def create(cls, **d):
        self = cls(d)
        self['_id'] = self.id = guid()
        return self.create_me()
    def create_me(self):
        self['created'] = now()
        self['updated'] = now()
        self._col.insert(self, safe=True)
        return self

    #def save(self): return self.update(**self)

    def update(self, **d):
        if d.has_key('updated'): del d['updated']
        else: d['updated'] = now()
        dict.update(self, d)
        return self._col.update({ '_id' : self.id }, { '$set' : d })
    def update_cmd(self, d): return self._col.update({ '_id' : self.id }, d)

    def increment(self, d):
      """Increment counter(s) identified by a dict.
      For example {'foo': 2, 'bar': -1, 'baz.qux': 10}"""
      return self._col.update({ '_id' : self.id }, {'$inc': d}, upsert=True)

    def flag(self, name):
        return self._col.update({ '_id' : self.id }, {'$set': {'flags.' + name: True}})

    def unflag(self, name):
        return self._col.update({ '_id' : self.id }, {'$set': {'flags.' + name: False}})

    def flagged(self, name):
        if self.has_key('flags'):
            return self['flags'].get(name, False)
        else:
            return False

    def delete(self): return self._col.remove(spec_or_id=self.id, safe=True)

def fetch(cname, id, keyname='_id'):
    return Entity({}, cname=cname).fetch_me(id, keyname=keyname)
def create(cname, **d): return Entity(d, cname=cname).create_me()


from crypt import crypt
db.user.ensure_index('name', unique=True)
class User(Entity):
    cname = 'user'
    def __init__(self, d):
        super(User, self).__init__(d)
        self.logged_in = False

    # structure
    #     name = str
    #    ,password = str
    #    ,fullname = str
    #    ,referrer = User
    #    ,sites = [str]

    def expr_create(self, d):
        doc = dict(owner = self.id, name = '', domain = self['sites'][0]) 
        doc.update(d)
        return Expr.create(**doc)

    def create_me(self):
        self['name'] = self['name'].lower()
        self['signup_group'] = config.signup_group
        assert re.match('[a-z][a-z0-9]{2,}$', self['name']) != None, 'Invalid username'
        self.set_password(self['password'])
        self['fullname'] = self.get('fullname', self['name'])
        self['referrals'] = 0
        assert self.has_key('referrer')
        return super(User, self).create_me()

    def new_referral(self, d):
        if self.get('referrals', 0) > 0 or self == get_root():
            self.update(referrals=self['referrals'] - 1)
            d.update(user = self.id)
            return Referral.create(**d)

    @classmethod
    def named(cls, name):
        self = cls({})
        return self.fetch_me(name.lower(), keyname='name')

    def cmp_password(self, v):
        return crypt(v, self['password']) == self['password']

    def set_password(self, v):
        salt = "$6$" + junkstr(8)
        self['password'] = crypt(v, salt)


def get_root(): return User.named('root')
if not get_root():
    import getpass
    print("Enter password for root user. You have one chance only:")
    secret = getpass.getpass()
    root = User.create(name='root', password=secret, referrer=None)

class Session(Entity):
    cname = 'session'

import re
def normalize(ws):
    return filter(lambda s: re.match('\w', s), re.split('\W', ws.lower()))

def media_path(user, f_id=None):
    p = joinpath(config.media_path, user['name'])
    return joinpath(p, f_id) if p else p

db.expr.ensure_index([('domain', 1), ('name', 1)], unique=True)
db.expr.ensure_index([('owner', 1), ('updated', 1)])
db.expr.ensure_index([('updated', 1)])
db.expr.ensure_index([('created', 1)])
db.expr.ensure_index([('tags_index', 1)])
class Expr(Entity):
    cname = 'expr'
    counters = ['owner_views', 'views', 'emails']

    @classmethod
    def named(cls, domain, name):
        self = cls({})
        return self.find_me(domain=domain, name=name.lower())

    @classmethod
    def with_url(cls, url):
        """ Convenience utility function not used in production, retrieve Expr from full URL """
        [(domain, port, name)] = re.findall(r'//(.*?)(:\d+)?/(.*)$', url)
        return cls.named(domain, name)

    @classmethod
    def list(cls, spec, requester=None, limit=300, page=0, sort='updated'):
        es = map(Expr, db.expr.find(
             spec = spec
            ,sort = [(sort, -1)]
            ,limit = limit
            ,skip = limit * page
            ))

        can_view = lambda e: (
            requester == e['owner'] or (e.get('auth', 'public') == 'public'
            and len(e.get('apps', [])) ))
        return filter(can_view, es)

    @classmethod
    def list_count(cls, spec):
        return db.expr.find(spec = spec).count()

    def update(self, **d):
        if d.get('tags'): d['tags_index'] = normalize(d['tags'])
        return super(Expr, self).update(**d)

    def create_me(self):
        assert map(self.has_key, ['owner', 'domain', 'name'])
        self['owner_name'] = User.fetch(self['owner'])['name']
        self['domain'] = self['domain'].lower()
        self.setdefault('title', 'Untitled')
        self.setdefault('auth', 'public')
        return super(Expr, self).create_me()

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

    def set_tld(self, domain):
        """ Sets the top level domain (everything following first dot) in domain attribute """
        return self.update(updated=False, domain=re.sub(r'([^.]+\.[^.]+)$', domain, self['domain']))


class File(Entity):
    cname = 'file'

    def create_me(self):
        """ Uploads file to s3 if config.aws_id is defined, otherwise
        saves in config.media_path
        """

        self['owner']
        tmp_path = self['path']
        del self['path']
        name = urllib.quote_plus(self['name'].encode('utf8'))

        if config.aws_id:
            b = random.choice(s3_buckets)
            self['s3_bucket'] = b.name
            k = S3Key(b)
            k.name = self.id
            k.set_contents_from_filename(tmp_path,
                headers={ 'Content-Disposition' : 'inline; filename=' + name, 'Content-Type' : self['mime'] })
            k.make_public()
            url = k.generate_url(86400 * 3600, query_auth=False)
            os.remove(tmp_path)
        else:
            owner = User.fetch(self['owner'])
            fs_name = self.id + mimetypes.guess_extension(self['mime'])
            path = media_path(owner, fs_name)
            os.renames(tmp_path, path)
            dict.update(self, fs_path=path)
            url =  abs_url() + 'file/' + owner['name'] + '/' + fs_name

        dict.update(self, url=url)
        return super(File, self).create_me()

    def delete(self):
        if self.get('s3_bucket'):
            k = s3_con.get_bucket(self['s3_bucket']).get_key(self.id)
            if k: k.delete()
        elif self.get('fs_path'): os.remove(self['fs_path'])

        super(File, self).delete()


class Referral(Entity):
    cname = 'referral'

    def create_me(self):
        self['key'] = junkstr(16)
        return super(Referral, self).create_me()


class Contact(Entity):
    cname = 'contact_log'

        
def abs_url(secure = False, domain = None, subdomain = None):
    """Returns absolute url for this server, like 'https://thenewhive.com:1313/' """

    proto = 'https' if secure else 'http'
    port = config.ssl_port if secure else config.plain_port
    port = '' if port == 80 or port == 443 else ':' + str(port)
    return (proto + '://' + (subdomain + '.' if subdomain else '') +
        (domain or config.server_name) + port + '/')


## analytics utils

def tags_by_frequency(**query):
    tags = {}
    for d in Expr.search(**query):
        if d.get('tags_index'):
            for t in d.get('tags_index'): tags[t] = tags.get(t, 0) + 1
    counts = [[tags[t], t] for t in tags]
    counts.sort(reverse=True)
    return [c[1] for c in counts]

def count(L):
    c = {}
    for v in L: c[v] = c.get(v, 0) + 1
    return sorted([(c[v], v) for v in c])
