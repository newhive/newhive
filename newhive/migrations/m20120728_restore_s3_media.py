import os, re
from newhive import state, config

db = state.Database(config)

from_dir = '/home/abram/recover/'

maybe_ids = os.listdir(from_dir+'bucket_in/')
legit_files = []
illegit_files = []
for i in maybe_ids:
    path = from_dir+'bucket_in/'+i
    res = db.File.fetch(i)
    if not res:
        os.rename(path, from_dir+'orphaned/'+i)
        continue
    if res.get('owner'): legit_files.append(res)
    else:
        print 'file record without owner! ' + res.id
        illegit_files.append(res)

    if res.get('s3_bucket') not in config.s3_buckets:
        print 'uploading ' + res.id
        with open(path) as f: res.reset_file(f)
    else: print 'skipping ' + res.id


#for e in db.Expr.search({}):


matched = {}
unfortunate_users = {}
n = 0
for file_res in legit_files:
    match = False
    if not unfortunate_users.has_key(file_res['owner']):
         unfortunate_users[file_res['owner']] = list(db.Expr.search({'owner': file_res['owner']}))
    maybe_busted_exprs = unfortunate_users[file_res['owner']]

    for res in maybe_busted_exprs:
        for i, app in enumerate(res.get('apps', [])):
            if not app['type'] in ['hive.html', 'hive.text', 'hive.image']: continue
            find_url = re.compile(file_res.id)

            if find_url.search(app.get('background', {}).get('url', '')):
                match = True
                matched.setdefault(file_res.id, [])
                matched[file_res.id].append((res.id, 'bg'))
                print str(n) + ': file ' + file_res.id + ' matches ' + res.id + ' in background'

            if find_url.search(app.get('content', '')):
                match = True
                matched.setdefault(file_res.id, [])
                matched[file_res.id].append((res.id, i))
                print str(n) + ': file ' + file_res.id + ' matches ' + res.id + ' in app ' + str(i)
    if not match:
        print str(n) + ': file with no expr: ' + file_res.id

    n++
