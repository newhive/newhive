# Server globals
# 
# Globals that track the server state. db, etc
import jinja2
import os.path
from urllib import quote_plus

from newhive.assets import HiveAssets
from newhive import state, config
from newhive.extra_json import extra_json
from newhive.colors import colors

hive_assets = HiveAssets()
hive_assets.bundle()

jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(os.path.join(config.src_home, 'templates')))
jinja_env.trim_blocks = True
jinja_env.globals.update(asset_bundle=hive_assets.asset_bundle)
jinja_env.filters.update({ 'asset_url': hive_assets.url, 'json': extra_json,
    'param_esc': quote_plus })
jinja_env.globals.update({
     'colors': colors
    ,'asset_bundle': hive_assets.asset_bundle
})

db = state.Database(config, hive_assets)
server_env = {
     'db': db
    ,'jinja_env': jinja_env
    ,'assets': hive_assets
    ,'config': config
}

jinja_env.globals.update({
    'media_bucket': db.s3.bucket_url('media')
})
