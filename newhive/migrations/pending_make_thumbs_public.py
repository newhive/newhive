from newhive.db_tools import *

b = db.s3.buckets['media']

def fix_thumb(f, **args):
    tks = f.get('thumbs')
    tks2 = tks.copy()
    for n in tks:
        name = f.id + '_' + n
        k = b.get_key(name)
        if k:
            k.make_public()
        else:
            del tks2[n]
            f.update(thumbs=tks2, updated=False)
    return True

def migrate():
    Apply.apply_continue( fix_thumb, db.File, mq().exists('thumbs') )