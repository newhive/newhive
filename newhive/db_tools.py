import re

import newhive
from newhive import state
from newhive.utils import now, time_u, Apply, lget
from newhive.server_session import db
from newhive.mongo_helpers import mq

# A couple handy defaults
nd = db.User.named('newduke')
ac = db.User.named('abram')
e1 = db.Expr.with_url('newduke/index')

def show_sizeof(x, level=0,show_deep=0):
    if (level <= show_deep):
        print "\t" * level, x.__class__, sys.getsizeof(x), x

    if hasattr(x, '__iter__'):
        if hasattr(x, 'items'):
            for xx in x.items():
                show_sizeof(xx, level + 1, show_deep)
        else:
            for xx in x:
                show_sizeof(xx, level + 1, show_deep)

def recent_exprs(within_secs):
    return db.Expr.search({'updated': {'$gt': now() - within_secs}})

def new_exprs(within_secs):
    return db.Expr.search({'created': {'$gt': now() - within_secs}})

def name(entity):
    if type(entity) == list:
        return names(entity)
    if type(entity) == state.Cursor:
        return names(list(entity))
    if type(entity) in [str, unicode]:
        e = db.Expr.fetch(entity)
        if e:
            return name(e)
        e = db.User.fetch(entity)
        if e:
            return name(e)
        return False

    res = ''
    if entity.has_key('owner_name'):
        res = entity['owner_name'] + '/'
    return res + entity['name']

def names(entity_list):
    return map(name, entity_list)

def exprs_with_embeds():
    return db.Expr.search({'apps': {'$elemMatch': {
        'type': 'hive.html', 'content': re.compile(r'<object|<embed', re.I)}}})

def exprs_with_jplayer():
    return db.Expr.search({'apps': {'$elemMatch': {
        'content': re.compile(r'jplayer', re.I)}}})

def create_user(name):
    db.User.create({"name": name,
        "email":"me@somewhere.com",
        "sites":[name + ".thenewhive.com"],
        "password":"password",
        "referrer":db.User.site_user.id
        })
    return db.User.named(name)
    # new = db.User.named(name)
    # nd = db.User.named("newduke")

def ids_from_urls(urls):
    return map(lambda x:db.Expr.with_url(x).id, urls)

def insert_tagged(user, tag, ids):
    assert type(ids)==list and type(tag)==str

    if not user.has_key('tagged'):
        user['tagged'] = {}
    user['tagged'][tag] = ids
    user.save(updated=False)

# Get a referall URL from a particular user
def new_referral_link(from_user_name, to_email='', reuse=1):
    return str(new_referral(
        from_user_name=from_user_name, to_email=to_email, reuse=reuse).url)
def new_referral(from_user_name, to_email='', reuse=1):
    return db.User.named(from_user_name).new_referral(
        {'to': to_email, 'reuse': reuse})
