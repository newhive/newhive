from newhive.db_tools import *

b = db.s3.buckets['media']

def fix_thumb(f, **args):                                                 
    thumbs = [f.id + '_' + n for n in f.get('thumbs',[])]
    for n in thumbs:
        k = b.get_key(n)
        if k:
            k.make_public()
        else:
            return False
    return True

def migrate():
    Apply.apply_continue( fix_thumb, db.File, mq().exists('thumbs') )