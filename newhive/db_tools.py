import re

import newhive
from newhive import state
from newhive.utils import now, time_u, Apply, lget, memoized
from newhive.server_session import db, server_env
from newhive.mongo_helpers import mq
from newhive.cp_expr import cp_expr

assets = server_env['assets']
jinja_env = server_env['jinja_env']
config = server_env['config']

# A couple handy defaults
nd = db.User.named('newduke')
ac = db.User.named('abram')
e1 = db.Expr.with_url('newhive/default-instructional')

@memoized
def dbs(name):
    conf = __import__('newhive.config.' + name, fromlist=['newhive','config'])
    return state.Database(conf)

# returns cursor with expressions at most %days% old which have > 1 fail count
def recent_snapshot_fails(days=1):
    return db.Expr.search({ 'snapshot_fails':{'$gt':1}
        ,'updated':{'$gt': now() - days*86400} })

# resets the fail count of given list or cursor of expressions
# param{run_local}: if True, take the snapshot in the current thread
def snapshot_reset(exprs, run_local=False):
    exprs = list(exprs)
    if len(exprs) == 0: return
    if isinstance(exprs[0], basestring):
        exprs = db.Expr.fetch(exprs)
    for r in exprs:
        if run_local:
            r.take_snapshots()
        else:
            r.update(updated=False, snapshot_fails=0)

def snapshot_redo_collection(username='zach', redo=False, collection='brokensnapshots', retry=5):
    rs = db.Expr.fetch(list(set(db.User.named(username)['tagged'][collection])))
    for a in range(retry):
        for r in rs:
            if redo or r.get('snapshot_time', 0) < r.get('updated'):
                r.take_snapshots()

def show_sizeof(x, level=0, show_deep=0):
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

def new_exprs_weekly(weeks=20):
    return new_exprs_periodic(periods=weeks, period=7*86400)
def new_exprs_periodic(periods=20, period=7*86400):
    expr_counts = [new_exprs(secs).count() for secs in xrange(0, period*periods, period)]
    return [expr_counts[i + 1] - expr_counts[i] for i in xrange(periods - 1)]

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
        e = db.Expr.with_url(entity)
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
