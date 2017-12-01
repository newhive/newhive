import os
from md5 import md5
import re
from newhive.utils import Apply, lget
from newhive.server_session import db
from newhive.s3 import GoogleStorage
from newhive.mongo_helpers import mq


def tupdate(t, i, v):
    return t[:i] + (v,) + t[i+1:]


def write_lines(lines, fname):
    with open(fname, 'w') as f:
        f.writelines(l + '\n' for l in lines)


def read_lines(filename):
    with open(filename) as f:
        return [s.strip('\n') for s in f.readlines()]


def paths_from_files(fs):
    return [p for ps in [[f.id] + f.child_paths() for f in fs] for p in ps]


def file_meta(p):
    with open(p) as f:
        csum = md5(f.read()).hexdigest()
    return dict(size=os.stat(p).st_size, md5=csum)


def file_md5_and_size_update(db_file, cache_path):
    db_file.update(**file_meta(cache_path + db_file.id))


def replace_url(d, k, path):
    s = d.get(k)
    if not s: return False
    s_new = re.sub(
        r'(https?:)?//[a-z\d.:]+/(file/)?([0-9a-f]{24})',
        r'//media.tnh.me/' + path + r'/\3',
        s
    )
    if s != s_new:
        d[k] = s_new
        return True
    else:
        return False


def fixup_apps(expr):
    apps = expr.get('apps', [])
    if type(apps) != list:
        apps = []
    updated = False
    bg = expr.get('background')
    for a in (apps + ([bg] if bg else [])):
        atype = a.get('type', 'hive.image')
        if atype not in ('hive.image', 'hive.code', 'hive.html', 'hive.audio'):
            continue

        file_id = a.get('file_id')
        if not file_id:
            file_match = expr._match_id(a.get('url') or a.get('content'))
            if not file_match:
                continue
            if len(file_match) > 1:
                print('multiple files', expr.id)
            updated = True
            file_id = a['file_id'] = file_match[0]

        if atype == 'hive.image' and file_id:
            if a.get('url'):
                del a['url']
                updated = True
            if a.get('content'):
                del a['content']
                updated = True
        else:
            up1 = replace_url(a, 'url', expr['owner'])
            up2 = replace_url(a, 'content', expr['owner'])
            updated = updated or up1 or up2

    return updated


def fixup_expr_app_files(expr, dryrun=True):
    updated = fixup_apps(expr)
    if updated and not dryrun:
        expr.update(apps=expr['apps'], updated=False)
    return updated


def file_owner():
    index = {}
    count = 0
    for r in db.Expr.search({}, fields=['file_id', 'snapshot_id', 'owner']):
        fs = r.get('file_id', [])
        if r.get('snapshot_id'):
            fs.append(r['snapshot_id'])
        for f in fs:
            index[f] = r['owner']

        if not count % 5000:
            print(count, r.id)
        count += 1
    return index


def file_add_owner(fs_owner, f, dryrun=True):
    if f.get('owner'):
        return False
    owner = fs_owner.get(f.id)
    if owner and not dryrun:
        f.update(owner=owner)
    return True if owner else False


def migrate(**kwargs):
    Apply.apply_continue(fixup_expr_app_files, db.Expr, **kwargs)


## batch file transfer.
# To download a batch from a list of URLs:
#base_path=http://s1-thenewhive.s3.amazonaws.com/ cat ../files-batch1-paths \
#  | perl -pe '$_ = "'$base_path'" . $_ . " out=" . $_' | aria2c -i - -x 10

CACHE='/data/media/'

MIME_FIXES = {
    'gif': 'image/gif',
    'image%2Fgif': 'image/gif',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'image': True
}


def file_mime_fix(f, dryrun=True):
    mime = f.get('mime')
    if mime in MIME_FIXES:
        if mime == 'image':
            name = f.get('name', '').lower()
            if name.endswith('.jpg'):
                mime = 'image/jpeg'
            elif name.endswith('.gif'):
                mime = 'image/gif'
            else:
                return False
        else:
            mime = MIME_FIXES[f['mime']]

        if not dryrun:
            f.update(mime=mime)
        f['mime'] = mime
        return True
    return False


def upload_batch(page=0, limit=None, skip=0, report_freq=500, redo=False, children_only=False):
    gs = GoogleStorage()

    fs_paths = os.listdir(CACHE)
    fs_ids = [s for s in fs_paths if '_' not in s]

    offset = page * limit + skip
    end = offset + limit if limit else len(fs_paths)
    fs_ids_slice = fs_ids[offset:end]

    files = { f.id : f for f in db.File.fetch(fs_ids_slice) }

    uploaded = 0
    for n, fid in enumerate(fs_ids_slice):
        f = files.get(fid)
        if not f:
            print('missing', fid)
            continue

        path_base = (f.get('owner') or '0') + '/'
        path =  path_base + f.id
        if not redo and gs.file_exists('media', path):
            print('exists', fid)
            continue

        args = (CACHE + f.id, 'media', path, f['mime'], f['md5'])
        if not children_only:
            try:
                gs.upload_file(*args)
            except Exception as e:
                print('upload failed', f)
                raise e

        for p in f.child_paths():
            args2 = (CACHE + p, 'media', path_base + p, f['mime'])
            try:
                gs.upload_file(*args2)
            except Exception as e:
                print('child upload failed!!', f)
                raise e

        if not uploaded % report_freq:
            print(page * limit, '+', skip + n, fid)
        uploaded += 1
