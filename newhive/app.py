from werkzeug.routing import Map, Rule
from werkzeug import Request, Response, exceptions, url_unquote
import jinja2
import os.path
from newhive.utils import dfilter
from newhive import state, config
from newhive.colors import colors
from newhive.controllers.shared import ( no_zero, large_number, querystring,
    length_bucket, friendly_date, epoch_to_string )
from newhive.assets import HiveAssets
from newhive.controllers.api import Controllers as Api
from newhive.extra_json import extra_json
from newhive.routes import Routes
import json, urllib


hive_assets = HiveAssets()
hive_assets.bundle()

jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(os.path.join(config.src_home, 'templates')))
jinja_env.trim_blocks = True
jinja_env.globals.update(asset_bundle=hive_assets.asset_bundle)
jinja_env.globals.update(get_route_anchor_attrs=Routes.get_route_anchor_attrs)

def get_api_endpoints(api):
    routes = Routes.get_routes()
    rules = []
    for route_name, route_obj in routes.items():
        # Add page route
        rules.append(Rule(
            route_obj['page_route'],
            endpoint=(getattr(api,route_obj['controller']),route_obj['method']),
            host=config.server_name,
            defaults=dfilter(route_obj, ['client_method'])
        ))
        # And API route
        rules.append(Rule(
            route_obj['api_route'],
            endpoint=(getattr(api,route_obj['controller']),route_obj['method']),
            defaults={'json':True}
        ))
    return rules

jinja_env.filters.update({
     'asset_url': hive_assets.url
    ,'json': extra_json
    ,'large_number': large_number
    ,'length_bucket': length_bucket
    ,'mod': lambda x, y: x % y
    ,'no_zero': no_zero
    ,'time': friendly_date
    ,'urlencode': lambda s: urllib.quote(s.encode('utf8'))
})

db = state.Database(config)
server_env = {
     'db': db
    ,'jinja_env': jinja_env
    ,'assets': hive_assets
    ,'config': config
}

jinja_env.globals.update({
     'colors': colors
    ,'asset_bundle': hive_assets.asset_bundle
})

api = Api(server_env)

# the endpoints are (Controller, method_str) tuples
endpoints = [
    Rule('/api/expr', endpoint=(api.expr, 'index')),
    Rule('/api/expr/<id>', endpoint=(api.expr, 'fetch')),
    Rule('/api/expr/thumb/<id>', endpoint=(api.expr, 'thumb')),
    Rule('/api/user/login', endpoint=(api.user, 'login')),
    Rule('/api/user/logout', endpoint=(api.user, 'logout')),
    Rule('/api/search', endpoint=(api.search, 'search')),
    Rule('/home/streamified_test', endpoint=(api.user, 'streamified_test')),
    Rule('/home/streamified_login', endpoint=(api.user, 'streamified_login'))
]

endpoints.extend(get_api_endpoints(api))

# Add these catch-all routes last
endpoints.extend([
    Rule('/<owner_name>', endpoint=(api.community, 'user_home')), #, host=config.server_name),
    Rule('/<owner_name>/<expr_name>', endpoint=(api.community, 'expr')),
    Rule('/<expr_id>', endpoint=(api.expr, 'fetch_naked'))
])

routes = Map(endpoints, strict_slashes=False) #, host_matching=True)

@Request.application
def handle(request):
    try: (controller, handler), args = routes.bind_to_environ(
        request.environ).match()
    except exceptions.NotFound as e:
        return api.controller.serve_500(request, Response(),
            exception=e, json=False)
    print (controller, handler), args
    return controller.dispatch(handler, request, **args)

application = handle