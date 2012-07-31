import os, re
from newhive import state, config

db = state.Database(config)

from_dir = '/home/abram/recover/'
maybe_ids = os.listdir(from_dir+'bucket_in/')
legit_files = []
illegit_files = []

def recover():
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
