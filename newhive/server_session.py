# Server globals
# 
# Globals that track the server state. db, etc

from newhive.assets import HiveAssets
from newhive import state, config
import jinja2
import os.path
from newhive.extra_json import extra_json
from newhive.colors import colors

hive_assets = HiveAssets()
hive_assets.bundle()

jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(os.path.join(config.src_home, 'templates')))
jinja_env.trim_blocks = True
jinja_env.globals.update(asset_bundle=hive_assets.asset_bundle)
jinja_env.filters.update({ 'asset_url': hive_assets.url, 'json': extra_json })
jinja_env.globals.update({
     'colors': colors
    ,'asset_bundle': hive_assets.asset_bundle
})

db = state.Database(config)
server_env = {
     'db': db
    ,'jinja_env': jinja_env
    ,'assets': hive_assets
    ,'config': config
}

