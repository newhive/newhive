import re, pymongo, pymongo.objectid
from pymongo.connection import DuplicateKeyError
from datetime import datetime
import config


con = pymongo.Connection()
db = con[config.database]

def now(): return time_s(datetime.utcnow())
def time_s(t): return int(t.strftime('%s'))
def time_u(t): return datetime.utcfromtimestamp(t)

import random
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
        return self.create_me()
    def create_me(self):
        self['_id'] = self.id = str(pymongo.objectid.ObjectId())
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
        assert re.match('[a-z][a-z0-9]{2,}$', self['name']) != None, 'Invalid username'
        self.set_password(self['password'])
        self['fullname'] = self.get('fullname', self['name'])
        self['referrals'] = 0
        assert self.has_key('referrer')
        return super(User, self).create_me()

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

db.expr.ensure_index([('domain', 1), ('name', 1)], unique=True)
db.expr.ensure_index([('owner', 1), ('updated', 1)])
db.expr.ensure_index([('updated', 1)])
db.expr.ensure_index([('created', 1)])
db.expr.ensure_index([('tags_index', 1)])
class Expr(Entity):
    cname = 'expr'

    @classmethod
    def named(cls, domain, name):
        self = cls({})
        return self.find_me(domain=domain, name=name.lower())

    @classmethod
    def list(cls, spec, requester=None, limit=999, page=0, sort='updated'):
        es = map(Expr, db.expr.find(
             spec = spec
            ,sort = [(sort, -1)]
            ,limit = limit
            ,skip = limit * page
            ))

        can_view = lambda e: (
            (requester == e['owner'] or (e.get('auth', 'public') == 'public'))
            and len(e.get('apps', [])))
        return filter(can_view, es)

    def update(self, **d):
        if d.get('tags'): d['tags_index'] = normalize(d['tags'])
        #d['index'] = (
        #      normalize(d.get('tags', self.get('tags', '')))
        #    + normalize(d.get('name', self['name']))
        #    + normalize(d.get('title', self['title']))
        #    )
        return super(Expr, self).update(**d)

    def create_me(self):
        assert map(self.has_key, ['owner', 'domain', 'name'])
        self['owner_name'] = User.fetch(self['owner'])['name']
        self['title'] = self.get('title') or 'Untitled'
        self['domain'] = self['domain'].lower()
        return super(Expr, self).create_me()

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


class File(Entity):
    cname = 'file'
        #if not r: # TODO: check out the file system
        #    return None
        #return self

class Log(Entity):
    cname = 'log'

#class Resource(Entity):
#    site = Field(String(255))
#    subdomain = Field(String(20))
#    path = Field(String(255))
#
#class File(Resource):
#    content_type = Field(String(100))
#    fspath = Field(String(255))
#
#class Expr(Resource):
#    data = Field(Text())
