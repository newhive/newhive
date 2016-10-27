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

def expr_count(days_ago, days=1, query={}):
    return db.Expr.count(mq(query).day('created', days_ago, days))
def user_count(days_ago, days=1, query={}):
    return db.User.count(mq(query).day('created', days_ago, days))
def follow_count(d, q={}):
    q.update(mq(class_name='Star', entity_class='User').ne('entity',
        '4e0fcd5aba28392572000044')) # exclude default newhive follow
    return db.Feed.count(mq(q).day('created', d))

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

def get_entity(db_collection, fetch):
    r = False
    if isinstance(fetch, db_collection.entity): r = fetch
    elif state.is_mongo_key(fetch): r = db_collection.fetch(fetch)
    elif type(fetch) == str: r = db_collection.named(fetch)
    return r

# Switch a session's user
# to_user: name of user to switch to
# from_user: name of logged in user, or supply session_id    
def switch_user(from_user, to_user, session_id=None, from_id=None):
    from_user = get_entity(db.User, from_user)
    to_user = get_entity(db.User, to_user)
    if not from_user or not to_user:
        print('User not found')
        return False
    session = ( db.Session.fetch(session_id) if session_id else
        db.Session.last(mq(user=from_user.id)) )
    session.update(user=to_user.id)

def rename_user(from_user, to_user):
    user = (db.User.named(from_user) if type(from_user) == 'string'
        else from_user)
    user.update(updated=False, name=to_user)
    for r in db.Expr.search(mq(owner=user.id)):
        r.update(updated=False, owner_name=to_user)
    for r in db.Feed.search(mq(initiator=user.id)):
        r.update(updated=False, initiator_name=to_user)
        

import csv
# expects data to be list of lists
def export_csv(data, file_name='newhive_query'):
    if not re.search('.csv$', file_name): file_name += '.csv'
    f = open(file_name, 'wb')
    wr = csv.writer(f, quoting=csv.QUOTE_ALL)
    for row in data:
        ascii_row = [col.encode('ascii', 'ignore') for col in row]
        wr.writerow(ascii_row)
def export_csv_emails():
    export_csv( [(r['email'], r['fullname']) for r in
        db.User.search({}, fields=dict(email=1, fullname=1))
        if r.has_key('email')], '/tmp/email_list' )

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
            r.take_snapshot()
        else:
            r.update(updated=False, snapshot_fails=0)

def snapshot_redo_collection(username='zach', redo=False, collection='brokensnapshots', retry=5):
    rs = db.Expr.fetch(list(set(db.User.named(username)['tagged'][collection])))
    for a in range(retry):
        for r in rs:
            if redo or r.get('snapshot_time', 0) < r.get('updated'):
                r.take_snapshot()
### END snapshot_wrangling ###
