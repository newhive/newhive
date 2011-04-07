from crypt import crypt
from pymongo import Connection
from datetime import datetime
import random
import config


con = Connection()
db = con[config.database]


def now(): return list(datetime.utcnow().timetuple())[:6]

def fetch(name, key, keyname='_id'): return db[name].find_one({ keyname : key })
def create(name, v):
    v['created'] = now()
    v['updated'] = now()
    return db[name].insert(v)
def update(name, vs):
    vs['updated'] = now()
    db[name].update({ '_id' : vs['_id'] }, { '$set' : vs })


class Entity(dict):
    @classmethod
    def dbname(cls): return cls.__name__.lower()

    @classmethod
    def fetch(cls, key): return cls(fetch('user', key))

    def save(self): return update(self.dbname(), self)
    def id(self): return self['_id']


db['user'].ensure_index('name', unique=True)
class User(Entity):
    @classmethod
    def create(cls, name, password):
        self = cls()
        self['_id'] = self['name'] = name
        self.set_password(password)
        self['fullname'] = name
        create('user', self)
        return self

    def cmp_password(self, v):
        return crypt(v, self['password']) == self['password']

    def set_password(self, v):
        def chrange(c1, c2): return [chr(i) for i in range(ord(c1), ord(c2)+1)]
        chrs = chrange('0', '9') + chrange('A', 'Z') + chrange('a', 'z') + ['.', '/']
        salt = "$6$" + ''.join([chrs[random.randrange(0, 64)] for _ in range(8)])
        self['password'] = crypt(v, salt)

class Session(Entity):
    @classmethod
    def create(cls, user):
        self = cls()
        self['user'] = user
        create('session', self)
        return self


#class Resource(Entity):
#    using_options(inheritance='multi')
#    site = Field(String(255))
#    subdomain = Field(String(20))
#    path = Field(String(255))
#
#class File(Resource):
#    using_options(inheritance='multi')
#    content_type = Field(String(100))
#    fspath = Field(String(255))
#
#class Expr(Resource):
#    data = Field(Text())
