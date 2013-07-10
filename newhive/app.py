import sys
from werkzeug.routing import Map, Rule, RequestRedirect
from werkzeug import Request, Response, exceptions, url_unquote
import jinja2
from newhive.utils import dfilter
from newhive import state, config
# from newhive.controllers.shared import ( no_zero, large_number, querystring,
#     length_bucket, friendly_date, epoch_to_string )
# from newhive.assets import HiveAssets
from newhive.controllers import Controllers
from newhive.routes import Routes
import json, urllib
from newhive.utils import url_host, now
from newhive.server_session import db, server_env, jinja_env

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
        if route_obj.get('page_route'):
            for secure in (False, True):
                rules.append(Rule(
                    route_obj['page_route'],
                    endpoint=(getattr(api,route_obj['controller']),
                        route_obj['method']),
                    defaults={'route_name': route_name},
                    host=url_host(secure=secure)
                ))

        # And API routes
        if route_obj.get('api_route'):
            for secure in (False, True):
                rules.append(Rule(
                    route_obj['api_route'],
                    endpoint=(getattr(api,route_obj['controller']),
                        route_obj['method']),
                    defaults={'json':True, 'route_name': route_name},
                    host=url_host(secure=secure)
                ))
    return rules

api = Controllers(server_env)

# rules tuples are (routing_str, endpoint)
# the endpoints are (Controller, method_str) tuples
rules_tuples = [
    ('/api/expr/thumb/<id>', (api.expr, 'thumb')),
    ('/api/user/login', (api.user, 'login')),
    ('/api/user/logout', (api.user, 'logout')),
    ('/home/streamified_test', (api.user, 'streamified_test')),
    ('/home/streamified_login', (api.user, 'streamified_login')),
    ('/api/user/create', (api.user, 'create')),
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
    time_start = now()
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
    try:
        result = controller.dispatch(handler, request, **args)
    except:
        (blah, exception, traceback) = sys.exc_info()
        result = api.controller.serve_500(request, Response(), exception=exception,
            traceback=traceback, json=False)
    print request
    print "time %s ms" % (1000.*(now() - time_start))
    return result

application = handle
