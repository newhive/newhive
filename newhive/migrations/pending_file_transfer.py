import os
from md5 import md5
import re
from newhive.utils import Apply
from newhive.server_session import db

def write_lines(lines, fname):
    with open(fname, 'w') as f:
        f.writelines([l + '\n' for l in lines])

def paths_from_files(fs):
    return [p for ps in [[f.id] + f.child_paths() for f in fs] for p in ps]

def file_meta(p):
    with open(p) as f:
        csum = md5(f.read()).hexdigest()
    return dict(size=os.stat(p).st_size, md5=csum)

def update_md5_and_size(db_file, cache_path):
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

def file_add_owner(f, dryrun=True):
    r = f.db.Expr.fetch(dict(file_id=f.id))
    if r and not dryrun:
        f.update(owner=r['owner'])
    return True if r else False

def migrate(**kwargs):
    Apply.apply_continue(fixup_expr_app_files, db.Expr, **kwargs)
