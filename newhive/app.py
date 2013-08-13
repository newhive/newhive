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

# For stats
import yappi
import cProfile
import pstats
import io
from newhive.profiling import don, functools, doflags

def make_routing_rules(url_pattern, endpoint, on_main_domain=True, with_ssl=True, without_ssl=True):
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
                    endpoint=(
                        getattr(api, route_obj.get('controller', 'community')),
                        route_obj.get('method', 'empty')
                    ),
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
# TODO-cleanup: move these to routes.json
rules_tuples = [
    ('/home/streamified_test', (api.user, 'streamified_test')),
    ('/home/streamified_login', (api.user, 'streamified_login')),
]
rules = []
for rule in rules_tuples:
    rules.extend(make_routing_rules(rule[0], endpoint=rule[1]))
rules.extend(get_api_endpoints(api))

# Add these catch-all routes last
rules.extend(make_routing_rules('/<owner_name>',
    endpoint=(api.community, 'user_home'), on_main_domain=True))
rules.extend(make_routing_rules('/<expr_id>',
    endpoint=(api.expr, 'fetch_naked'), on_main_domain=False))
routes = Map(rules, strict_slashes=False, host_matching=True, redirect_defaults=False)

@Request.application
def handle(request):
    time_start = now()
    stats = False
    # stats = True
    if stats:
        pass
        # statprof.start()
        # if not yappi.is_running():
        #     yappi.start()
    try: (controller, handler), args = routes.bind_to_environ(
        request.environ).match()
    except exceptions.NotFound as e:
        1/0
        print "Serving 500!"
        return api.controller.serve_500(request, Response(),
            exception=e, json=False)
    except RequestRedirect as e:
        # what's going on here anyway?
        raise Exception('redirect not implemented: from: ' + request.url + ', to: ' + e.new_url)
    print (controller, handler), args
    try:
        if stats:
            pr = cProfile.Profile()
            pr.enable()
            doflags(functools.partial(controller.dispatch, handler, request, **args),
                ("iterations", "mini_expressions"),
                [6],
                [3])

        result = controller.dispatch(handler, request, **args)
        if stats:
            pr.disable()
            s = io.StringIO()
            ps = pstats.Stats(pr)
            ps.sort_stats('cumulative')
            ps.print_stats(25)

            ps.dump_stats("/var/www/newhive/stats")
    except:
        (blah, exception, traceback) = sys.exc_info()
        result = api.controller.serve_500(request, Response(), exception=exception,
            traceback=traceback, json=False)
    print request
    print "time %s ms" % (1000.*(now() - time_start))
    if stats and yappi.is_running():
        # statprof.stop()
        # statprof.display()
        yappi.stop()
        yappi.print_stats(sys.stdout, yappi.SORTTYPE_TTOT, yappi.SORTORDER_DESC, 25)
        yappi.clear_stats()

    return result

application = handle
