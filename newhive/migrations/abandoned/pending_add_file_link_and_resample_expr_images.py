import re
import urllib
import os

from newhive.utils import now, time_u, Apply
from newhive.controllers.file import fetch_url, create_file
from newhive.server_session import db

# (expr, app index, file id)
missing_file = []
# (expr, app index, file record)
new_file = []
# (expr, app index)
broken_image = []
# file_id
failed_resample = []
# (expr, app index, file_id)
resampled_file = []
# (expr, app index)
fixable_app_link = []

def update_expr(expr, update=True):
    apps = expr.get('apps')
    if not apps: return
    for i, a in enumerate(apps):
        if a.get('type') != 'hive.image':
            continue

        url = a.get('content')
        if not url:
            broken_image.append((expr.id, i))
            continue

        m = re.match(r'.*s3.amazonaws.com(:443)?/([a-z0-9]{24})\??.*$', url)
        if not m:
            if not update:
                print 'create', file_r.id, (expr.id, i, url)
                continue

            try:
                downloaded = fetch_url(url) 
            except:
                # give up
                continue 
            finally:
                new_file.append((expr.id, i, url))
            file_r = create_file(expr.owner, downloaded, url=url)
            apps[i]['file_id'] = file_r.id
            apps[i]['url'] = file_r['url']
            new_file.append((expr.id, i, file_r))
        else:
            if not update:
                print 'resample', file_id
                continue

            file_id = m.groups()[1]
            file_r = db.File.fetch(file_id)
            if not file_r:
                missing_file.append((expr.id, i, file_id))
                continue
            apps[i]['file_id'] = file_id
            if not file_r.set_resamples():
                try:
                    downloaded = fetch_url(url) 
                except:
                    # give up
                    failed_resample.append(file_id)
                    continue
                fixable_app_link.append((expr.id, i)) 
            else:
                resampled_file.append((expr.id, i, file_id))
    if update:
        expr.update(apps=apps, updated=False)
    return True

def migrate():
    Apply.all(update_expr, db.Expr.search({}))


#def find_expr_images():
#    for expr in db.Expr.search({}):
#        apps = expr.get('apps')
#        if not apps: continue
#        for i, a in enumerate(apps):
#            if a.get('type') != 'hive.image':
#                continue
#            url = a.get('content')
#            m = re.match(r'.*s3.amazonaws.com(:443)?/([a-z0-9]{24})\??.*$', url)
#            if not m:
#                print 'create', (expr.id, i, url)
