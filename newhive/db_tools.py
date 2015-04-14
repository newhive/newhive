import re
from collections import defaultdict

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

def query_created_days_ago(d, q={}):
    return mq(q).bt('created', now() - 86400 * (d + 1), now() - 86400 * d)
def count_created_days_ago(collection, d, q={}):
    return collection.count(query_created_days_ago(d, q))
def expr_count(*a): return count_created_days_ago(db.Expr, *a)
def user_count(*a): return count_created_days_ago(db.User, *a)
def follow_count(d, q={}):
    q.update(mq(class_name='Star', entity_class='User').ne('entity',
        '4e0fcd5aba28392572000044')) # exclude default newhive follow
    return count_created_days_ago(db.Feed, d, q)

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
        "sites":[name + ".newhive.com"],
        "password":"password",
        "referrer":db.User.site_user.id
        })
    return db.User.named(name)
    # new = db.User.named(name)
    # nd = db.User.named("newduke")

# Switch a session's user
# to_user: name of user to switch to
# from_user: name of logged in user, or supply session_id    
def switch_user(from_user, to_user, session_id=None):
    session = ( db.Session.fetch(session_id) if session_id else
        db.Session.last(mq(user=db.User.named(from_user).id)) )
    session.update(user=db.User.named(to_user).id)

import csv
# expects data to be list of lists
def export_csv(data, file_name='newhive_query'):
    if not re.search('.csv$', file_name): file_name += '.csv'
    f = open(file_name, 'wb')
    wr = csv.writer(f, quoting=csv.QUOTE_ALL)
    for row in data:
        wr.writerow(row)

### BEGIN snapshot_wrangling ###
# returns cursor with expressions at most %days% old which have > 1 fail count
def recent_snapshot_fails(days=1):
    return db.Expr.search( mq().bt('snapshot_fails', 5, 12)
        .gt('updated', now() - days*86400) )

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
### END snapshot_wrangling ###
