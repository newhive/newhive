import re
from newhive import state
db = state.Database()

from newhive.utils import now, time_u, Apply

from newhive.s3 import fixup_s3_url

def migrate():
    Apply.apply_all(fixup_expr_assets, db.Expr.search({}))
    Apply.apply_all(fixup_file_assets, db.File.search({}))

def fixup_expr_assets(expr):
    apps = expr.get('apps',[])
    for app in apps:
        fixup_assets_s3(app, ['url', 'content'])
    expr.update(apps=apps)
    return True;

def fixup_file_assets(f):
    fixup_assets_s3(f, ['url'])
    if f.get('url'):
        f.update(url=f['url'])
    return True;

def fixup_assets_s3(app, fields):
    for field in fields:
        url = app.get(field, False)
        if url and isinstance(url, basestring):
            app[field] = fixup_s3_url(url)
