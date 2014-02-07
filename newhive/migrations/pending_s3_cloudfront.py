import re
from newhive import state
db = state.Database()

from newhive.utils import now, time_u, Apply

# from newhive.s3 import fixup_s3_url

def fixup_s3_url(url):
    url = re.sub(r"(https?:)?//dev-1-s1-newhive.s3.amazonaws.com(:80|:443)?/",
        "//dev.media.tnh.me/", url)
    url = re.sub(r"(https?:)?//s[1-5]-thenewhive.s3.amazonaws.com(:80|:443)?/",
        "//media.tnh.me/", url)
    # url = re.sub(r'https?://([^/]*tnh.me)/', '//\1/', url)
    return url

def migrate(**opts):
    Apply.apply_continue(fixup_expr_assets, db.Expr, **opts)
    Apply.apply_continue(fixup_file_assets, db.File, **opts)

def fixup_expr_assets(expr, dryrun=True):
    if expr.get('migrated'):
        return True
    apps = expr.get('apps',[])
    for app in apps:
        fixup_assets_s3(app, ['url', 'content'])
    if not dryrun:
        expr.update(apps=apps,updated=False)
    return True;

def fixup_file_assets(f, dryrun=True):
    fixup_assets_s3(f, ['url'])
    if not dryrun:
        if f.get('url'):
            f.update(url=f['url'],updated=False)
    return True;

def fixup_assets_s3(app, fields):
    for field in fields:
        url = app.get(field, False)
        if url and isinstance(url, basestring):
            app[field] = fixup_s3_url(url)
