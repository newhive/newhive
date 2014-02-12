import re
from newhive import state
db = state.Database()

from newhive.utils import now, time_u, Apply

# from newhive.s3 import fixup_s3_url

def fixup_s3_url(url):
    url = re.sub(r"(https?:)?//dev-1-s1-newhive.s3.amazonaws.com(:80|:443)?/",
        "//d2pmwekhvitugk.cloudfront.net/", url)
    url = re.sub(r"(https?:)?//s[1-5]-thenewhive.s3.amazonaws.com(:80|:443)?/",
        "//d1v8u1ev1s9e4n.cloudfront.net/", url)
    # migrate from our cname to cloudfront
    url = re.sub(r"//dev.media.tnh.me/",
        "//d2pmwekhvitugk.cloudfront.net/", url)
    url = re.sub(r"//media.tnh.me/",
        "//d1v8u1ev1s9e4n.cloudfront.net/", url)
    # url = re.sub(r'https?://([^/]*tnh.me)(:80|:443)?/', '//\1/', url)
    # print url
    return url

def migrate(**opts):
    Apply.apply_continue(fixup_expr_assets, db.Expr, **opts)
    Apply.apply_continue(fixup_file_assets, db.File, **opts)

def fixup_expr_assets(expr, dryrun=True, force=False):
    if not force and expr.get('migrated'):
        return True
    apps = expr.get('apps',[])
    for app in apps:
        fixup_assets_s3(app, ['url', 'content'])
    background = expr.get('background')
    fixup_assets_s3(background, ['url'])
    if not dryrun:
        expr.update(apps=apps,background=background,updated=False)
    return True;

def fixup_file_assets(f, dryrun=True, force=False):
    fixup_assets_s3(f, ['url'])
    if not force and not dryrun:
        if f.get('url'):
            f.update(url=f['url'],updated=False)
    return True;

def fixup_assets_s3(app, fields):
    for field in fields:
        url = app.get(field, False)
        if url and isinstance(url, basestring):
            app[field] = fixup_s3_url(url)
