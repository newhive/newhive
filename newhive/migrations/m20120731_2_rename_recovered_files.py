from newhive.utils import *
from newhive import state, config
db = state.Database(config)

before_fix = now() - 86400

def fix_file_gnarliness():
    for f in db.File.search({'s3_bucket': {'$in': ['d1-thenewhive', 'd2-thenewhive']}}):
        rename_file(f)
        
lost = []
ambiguous = []
def rename_file(broken_file):
    f = broken_file
    move_to = db.File.search({ 'owner':f['owner'], 'name':f['name'], 'updated': {'$gt': before_fix} })
    matches = move_to.count()
    dest = lget(move_to, 0)

    upd = { 'updated': False }
    if matches == 0:
        lost.append(f)
        upd['lost'] = True
        print 'lost file ' + f.id
        return
    elif matches == 1:
        upd['deleted'] = True
    else:
        ambiguous.append(f)
        upd['ambiguous'] = True
        print 'ambiguous file ' + f.id

    print 'renaming ' + f.id + ' to ' + dest.id
    f.update(**upd) # leave old file record for future reference

    for expr in db.Expr.search({'file_id': f.id}):
        print 'renaming references in expr ' + expr.id
        expr_replace_urls(expr, f, dest)

replace_counts = [0]
def expr_replace_urls(expr, old_file, new_file):
    upd = {}
    new_url = new_file['url']

    junk, n = replace_file_url( expr.get('thumb'), old_file.id, new_url )
    if n: upd['thumb_file_id'] = new_file.id
    replace_counts[0] += n

    if expr.get('thumb_file_id') == old_file.id:
        upd['thumb_file_id'] = new_file.id
        replace_counts[0] += 1

    bg, n = replace_file_url(expr.get('background', {}).get('url'), old_file.id, new_url)
    if n:
        upd['background'] = expr.get('background', {})
        upd['background']['url'] = bg
    replace_counts[0] += n

    app_matches = 0
    for a in expr.get('apps', []):
        content = a.get('content')
        if not isinstance(content, (str, unicode)): continue
        a['content'], n = replace_file_url(content, old_file.id, new_url)
        app_matches += n
    replace_counts[0] += app_matches

    if app_matches: upd['apps'] = expr['apps']
    if upd:
        upd['updated'] = False # don't set a new updated timestamp
        expr.update(**upd)
        print 'updated ' + ', '.join(upd.keys()) + ' in ' + expr.id
        
def replace_file_url(s, id, replacement):
    if not isinstance(s, (str, unicode)): return (s, 0)
    return re.subn(r'https?://.*?\.com/' + id + r'(\b|_)', replacement + r'\1', s)
