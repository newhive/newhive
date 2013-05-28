from werkzeug.routing import Map, Rule, RequestRedirect
from werkzeug import Request, Response, exceptions, url_unquote
import jinja2
import os.path
from newhive.utils import dfilter
from newhive import state, config
from newhive.colors import colors
# from newhive.controllers.shared import ( no_zero, large_number, querystring,
#     length_bucket, friendly_date, epoch_to_string )
from newhive.assets import HiveAssets
from newhive.controllers import Controllers
from newhive.extra_json import extra_json
from newhive.routes import Routes
import json, urllib
from newhive.utils import url_host

hive_assets = HiveAssets()
hive_assets.bundle()

jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(os.path.join(config.src_home, 'templates')))
jinja_env.trim_blocks = True
jinja_env.globals.update(asset_bundle=hive_assets.asset_bundle)
jinja_env.globals.update(get_route_anchor_attrs=Routes.get_route_anchor_attrs)

def make_routing_rules(url_pattern, endpoint, on_main_domain = True, with_ssl=True, without_ssl=True):
    rules = []
    if with_ssl:
        rules.append(Rule(url_pattern, endpoint=endpoint, host=url_host(on_main_domain=on_main_domain,secure=True)))
    if without_ssl:
        rules.append(Rule(url_pattern, endpoint=endpoint, host=url_host(on_main_domain=on_main_domain,secure=False)))
    return rules

def get_api_endpoints(api):
    routes = Routes.get_routes()
    rules = []

    for route_name, route_obj in routes.items():
        # Add page routes (for HTTP and HTTPS)
        for secure in (False, True):
            rules.append(Rule(
                route_obj['page_route'],
                endpoint=(getattr(api,route_obj['controller']),route_obj['method']),
                defaults={'route_name': route_name},
                host=url_host(secure=secure)
            ))

        # And API routes (optional)
        if not route_obj.get('api_route'): continue
        for secure in (False, True):
            rules.append(Rule(
                route_obj['api_route'],
                endpoint=(getattr(api,route_obj['controller']),route_obj['method']),
                defaults={'json':True, 'route_name': route_name},
                host=url_host(secure=secure)
            ))

    return rules

jinja_env.filters.update({
     'asset_url': hive_assets.url
    ,'json': extra_json
    # ,'large_number': large_number
    # ,'length_bucket': length_bucket
    # ,'mod': lambda x, y: x % y
    # ,'no_zero': no_zero
    # ,'time': friendly_date
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

api = Controllers(server_env)

# rules tuples are (routing_str, endpoint)
# the endpoints are (Controller, method_str) tuples
rules_tuples = [
    ('/api/expr/thumb/<id>', (api.expr, 'thumb')),
    ('/api/user/login', (api.user, 'login')),
    ('/api/user/logout', (api.user, 'logout')),
    ('/api/search', (api.search, 'search')),
    ('/home/streamified_test', (api.user, 'streamified_test')),
    ('/home/streamified_login', (api.user, 'streamified_login')),
    ('/api/comment/create', (api.user, 'comment_create')),
]

rules = []

for rule in rules_tuples:
    rules.extend(make_routing_rules(rule[0], endpoint=rule[1]))

rules.extend(get_api_endpoints(api))

# Add these catch-all routes last
catchall_rules_tuples = [
    ('/<owner_name>', (api.community, 'user_home')),
    ('/<expr_id>', (api.expr, 'fetch_naked'))
]

for rule in catchall_rules_tuples:
    rules.extend(make_routing_rules(rule[0], endpoint=rule[1], on_main_domain=(rule[0] != '/<expr_id>')))

routes = Map(rules, strict_slashes=False, host_matching=True, redirect_defaults=False)

@Request.application
def handle(request):
    try: (controller, handler), args = routes.bind_to_environ(
        request.environ).match()
    except exceptions.NotFound as e:
        print "Serving 500!"
        return api.controller.serve_500(request, Response(),
            exception=e, json=False)
    except RequestRedirect as e:
        # what's going on here anyway?
        raise Exception('redirect not implemented: from: ' + request.url + ', to: ' + e.new_url)
    print (controller, handler), args
    return controller.dispatch(handler, request, **args)

application = handle
