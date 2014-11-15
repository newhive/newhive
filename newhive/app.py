import sys, copy
import re
from werkzeug.routing import Map, Rule, RequestRedirect
from werkzeug import Request, Response, exceptions, url_unquote
import jinja2
from newhive.utils import dfilter
from newhive import state, config
from newhive.controllers import Controllers
from newhive.routes import Routes
import json, urllib
from newhive.utils import url_host, now
from newhive.server_session import db, server_env, jinja_env
from os.path import join

# For stats
import yappi
import cProfile
import pstats
import io
from newhive.profiling import don, functools, doflags

def make_routing_rules(url_pattern, endpoint, on_main_domain=True, defaults={}):
    rules = []
    for secure in (False, True):
        rules.append(Rule(url_pattern, endpoint=endpoint, defaults=defaults,
            host=url_host(on_main_domain=on_main_domain, secure=secure)))
    return rules

def get_api_endpoints(api):
    routes = Routes.get_routes()
    rules = []

    def default_route_args(route):
        route = dict(route)
        for k in ['page_route', 'api_route', 'method', 'controller']:
            if route.has_key(k): del route[k]
        return route

    for route_obj in routes:
        # Add page routes (for HTTP and HTTPS)
        for route_type in ['page_route', 'api_route']:
            path = route_obj.get(route_type)
            if not path: continue

            defaults = default_route_args(route_obj)
            if route_type == 'api_route':
                defaults['json'] = True
            for secure in (False, True):
                host = route_obj.get( 'host', url_host(secure=secure,
                    on_main_domain=not route_obj.get('content_domain')) )
                rules.append(Rule(
                    path,
                    endpoint=(
                        api.get(route_obj.get('controller', 'controller')),
                        route_obj.get('method', 'empty')
                    ),
                    defaults=defaults,
                    host=host
                ))
    return rules

# Create an empty, reference dict so all created controllers will have
# a reference to all controllers upon creation.
server_env['controllers'] = {}
api = Controllers(server_env)
server_env['controllers'].update(api)
base_controller = api.get('controller')
rules = get_api_endpoints(api)
routes = Map(rules, strict_slashes=False, host_matching=True,
    redirect_defaults=False)

# version. Belongs elsewhere?
def version():
    import subprocess
    ps = subprocess.Popen(["git","log","HEAD~1..HEAD"], stdout=subprocess.PIPE)
    output=subprocess.Popen(["head","-3"], stdin=ps.stdout,stdout=subprocess.PIPE)
    ps.wait()
    return output.communicate()[0]

config.version = version()

def split_domain(url):
    domain = url.replace('thenewhive','newhive')
    dev = config.dev_prefix + '.' if config.dev_prefix else ''
    index = max(0, domain.find('.' + dev + config.server_name), 
        domain.find('.' + dev + config.content_domain))
    prefix = domain[0:index]
    if index > 0: index = index + 1
    site = domain[index:]
    if prefix == 'www': prefix = ''
    return prefix, site

@Request.application
def handle(request):
    time_start = now()
    print(request)
    environ = copy.copy(request.environ)
    # Redirect www. links to naked URL
    if request.host.startswith('www.'):
        return base_controller.redirect(Response(), 
            re.sub('//www.', '//', request.url, 1), permanent=True)
    # Redirect thenewhive.com links to newhive.com
    if re.search('thenewhive.com', environ['HTTP_HOST']):
        return base_controller.redirect(Response(), 
            re.sub(r'//((.+\.)?)thenewhive\.com', r'//\1newhive.com', 
                request.url), permanent=True)

    prefix, site = split_domain(environ['HTTP_HOST'])
    # Convert any ip v4 address into a specific dns
    # site = re.sub('([0-9]+\.){3}[0-9]+','site',site) #//!!
    # Convert the specified DNS into the shorthand DNS (without search dns)
    # site = re.sub('(.*)\.(office|cos)\.newhive\.com','\g<1>',site) #//!!
    environ['HTTP_HOST'] = site
    if prefix not in config.live_prefixes:
        request.environ['HTTP_HOST'] = site
        if len(environ['PATH_INFO']) <= 1:
            environ['PATH_INFO'] = prefix
    stats = False
    # stats = True
    if stats:
        pass
        # statprof.start()
        # if not yappi.is_running():
        #     yappi.start()
    try: (controller, handler), args = routes.bind_to_environ(
        environ).match()
    except exceptions.NotFound as e:
        err=True
        if not config.live_server:
          try:
            err=False
            #dev = config.dev_prefix + '.' if config.dev_prefix else ''
            environ['HTTP_HOST'] = config.server_name + ':' + environ['SERVER_PORT']
            (controller, handler), args = routes.bind_to_environ(
                environ).match()
          except exceptions.NotFound as e:
            err=True
        if err:
            print "Gap in routing table!"
            print request
            return base_controller.serve_500(request, Response(),
                exception=e, json=False)
    except RequestRedirect as e:
        # bugbug: what's going on here anyway?
        raise Exception('redirect not implemented: from: ' + request.url + ', to: ' + e.new_url)

    # print controller
    # print handler
    try:
        if stats:
            pr = cProfile.Profile()
            pr.enable()
            doflags(functools.partial(controller.dispatch, handler, request, **args),
                ("iterations", "feed_max"),
                [5],
                [2000,1000,500,100])

        response = controller.dispatch(handler, request, **args)
        if stats:
            pr.disable()
            s = io.StringIO()
            ps = pstats.Stats(pr)
            ps.sort_stats('cumulative')
            ps.print_stats(25)

            ps.dump_stats(join(config.src_home, 'stats'))
            # To view stats graphically, use:
            # alias gprof='gprof2dot.py -f pstats stats | dot -Tpng -o output.png;open output.png'

    except:
        import traceback
        (blah, exception, traceback) = sys.exc_info()
        response = base_controller.serve_500(request, Response(), exception=exception,
            traceback=traceback, json=False)

    print "time %s ms" % (1000.*(now() - time_start))
    if stats and yappi.is_running():
        # statprof.stop()
        # statprof.display()
        yappi.stop()
        yappi.print_stats(sys.stdout, yappi.SORTTYPE_TTOT, yappi.SORTORDER_DESC, 25)
        yappi.clear_stats()

    # this allows unsecure pages to make API calls to https
    # response.headers.add('Access-Control-Allow-Origin', config.abs_url().strip('/'))
    # TODO-security: CONSIDER. Allow pages on custom domains to make API calls
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
    return response

application = handle
# for interactive debugging in apache. I believe you must use wsgi
# daemon mode for this to work. Put this in apache site config:
#   WSGIDaemonProcess site processes=1 threads=1 python-path=/var/www/newhive/
#   WSGIProcessGroup site
# TODO-perf: test whether daemon mode improves load testing
# if config.debug_mode:
#     from werkzeug.debug import DebuggedApplication
#     application = DebuggedApplication(application, evalex=config.debug_unsecure)
