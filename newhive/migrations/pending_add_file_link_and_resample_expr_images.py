import re
from newhive import state
db = state.Database()
from newhive.utils import now, time_u, Apply

import urllib
import os


# expr, app index, file_id
missing_file = []
# expr, app inedx, url
new_file = []
# expr, app index
broken_image = []

def update_file_links(expr, update=True):
    apps = expr.get('apps')
    if not apps: return
    for i, a in enumerate(apps):
        if a.get('type') != 'hive.image':
            continue

        url = a.get('url')
        if not url:
            broken_image.append((expr.id, i))
            continue

        m = re.match(r'.*s3.amazonaws.com(:443)?/([a-z0-9]{24})\??.*$', url)
        if not m:
            new_file.append((expr.id, i, url))
        else:
            file_id = m.groups()[1]
            file_r = db.File.fetch(file_id)
            if not file_r:
                missing_file.append((expr.id, i, file_id))
                continue
                
            apps[i]['file_id'] = file_id
            file_r.set_resamples()

def migrate():
    map(update_file_links, db.Expr.search({}))
