from __future__ import print_function
from itertools import imap, repeat

#def map_status(fn, iter, interval=1000, report=lambda n, r: n):
#    n = 0
#    for i in iter:
#        if not n % interval: print(report(n, i))
#        n += 1
#        yield fn(i)
#    if n:
#        print(report(n, i))
##        return report(n, i)
#
#def get_exprs(start_index='', limit=5000, store='exprs.json'):
#    page_index = ''
#    load_exprs = []
#    exprs = {}
#    while True:
#        batch = list(db.Expr.mq().gt('_id', page_index
#            )().sort('_id', 1).limit(limit))
#        exprs.extend(batch)
#        print(len(exprs), page_index)
#        if len(batch) < limit: break
#        page_index = batch[-1]['_id']
#    return exprs
#
#def normalize_file(f):
#    if not f.get('md5'):
#        dled = f.download()
#        if not dled: raise Exception("download failed for " + f.id)
#        f['md5'] = md5(r._file.read()).hexdigest()
#    if type(f['created']) == list:
#        f['created'] = mktime(f['created'] + [0,0,0])
#    if type(f['updated']) == list:
#        f['updated'] = mktime(f['updated'] + [0,0,0])


# mongo db.newhive.com/live --quiet --eval "db.expr.find().forEach(function(r){ print(JSON.stringify(r)) })" -u live -p $(< newhive/config/live_db_secret) > /tmp/exprs.ljson

files = []
with f.open('/tmp/exprs.ljson') as f:
    c = 0
    for l in f:
        j = json.loads(l)
        files.extend( j.get('file_id', []) )
        if j.get('snapshot_id'): files.append( j['snapshot_id'] )
        if not c % 1000: print(c, j['_id'])
        c += 1

c = 0
for f in files:
    r = db.File.fetch(f)
    if r:
        db.mdb.file_new.update({'_id':r['_id']}, r, upsert=True)
    if not c % 1000: print(c, r['_id'])
    c += 1

# copy forgotten profile BG and avatar files from old collection to current
c = 0
for r in db.User.search({}):
    for k in ['profile_bg_id', 'thumb_file_id']:
        if r.has_key(k): files.append(r[k])
    if not c % 1000: print(c, r['_id'])
    c += 1

c = 0
fail = []
for k in files:
    r = db.mdb.file_old.find_one({'_id':k})
    if r:
        db.mdb.file.update({'_id':k}, r, upsert=True)
    else:
        print('fail', k)
        fail.append(k)
    if not c % 500: print(c, k)
    c += 1

# enumerate missing files for user records
c = 0
u_miss = {}
for r in db.User.search({}):
    for k in ['profile_bg_id', 'thumb_file_id']:
        if r.has_key(k) and not db.File.fetch(r[k]):
            u_miss[r['_id']] = {}
            u_miss[r['_id']][k] = r[k]
    if not c % 1000: print(c, r['_id'])
    c += 1
