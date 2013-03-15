from werkzeug.routing import Map, Rule
from werkzeug import Request, Response, exceptions, url_unquote
import jinja2
import os.path
from newhive import state, config
from newhive.assets import HiveAssets
from newhive.controllers.api import Controllers as Api

hive_assets = HiveAssets()
hive_assets.bundle()

jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(os.path.join(config.src_home, 'templates')))
jinja_env.trim_blocks = True
jinja_env.globals.update(asset_bundle=hive_assets.asset_bundle)

db = state.Database(config)
server_env = {
     'db': db
    ,'jinja_env': jinja_env
    ,'assets': hive_assets
    ,'config': config
}

api = Api(server_env)

# the endpoints are (Controller, method_str) tuples
routes = Map([
    Rule('/api/expr/<id>', endpoint=(api.expr, 'fetch')),
    Rule('/api/user/<id>', endpoint=(api.user, 'fetch')),
    Rule('/api/expr/thumb/<id>', endpoint=(api.expr, 'thumb')),
    Rule('/home/network', endpoint=(api.community, 'home_feed'))
])

@Request.application
def handle(request):
	(controller, handler), args = routes.bind_to_environ(request.environ).match()
	return controller.dispatch(handler, request, **args)

application = handle