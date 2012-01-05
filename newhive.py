import os
from werkzeug.wrappers import Request, Response
from werkzeug.routing import Map, Rule
from werkzeug.exceptions import HTTPException, NotFound
from werkzeug.wsgi import SharedDataMiddleware
from werkzeug.utils import redirect

class Newhive(object):
    def __init__(self, config={}):
        self.site_host = 'thenewhive.com'
        if config['port']:
            self.site_host = self.site_host + ":" + str(config['port'])

        self.controllers = {
            'expression': ExpressionController()
            ,'user': UserController()
            ,'admin': AdminController()
            ,'analytics': AnalyticsController()
            }

        self.url_map = Map([
            Rule('/', endpoint='expression/list', host=self.site_host),
            Rule('/home/<tag>', endpoint='expression/list', host=self.site_host),
            Rule('/admin/<page>', endpoint='admin', host=self.site_host),
            Rule('/analytics/<page>', endpoint='analytics', host=self.site_host),
            Rule('/<path:path>', endpoint='404', host=self.site_host),

            Rule('/expressions', endpoint='user/expr_index', host='<host>'),
            Rule('/expressions/<tag>', endpoint='user/expr_index', host='<host>'),
            Rule('/<path:expr_path>', endpoint='expression/show', host='<host>')
        ], host_matching=True)

    def error_404(self):
        return Response('page not found', mimetype='text/plain', status=404)

    def dispatch_request(self, request):
        adapter = self.url_map.bind_to_environ(request.environ)
        try:
            endpoint, args = adapter.match()
            endpoint = endpoint.split('/')
            controller = endpoint[0]
            method = endpoint[1] if len(endpoint)>1 else 'default'
            if controller == '404': return self.error_404()
            else:
                return getattr(self.controllers.get(controller), method)(request, args)
        except  NotFound, e:
            return self.error_404()
        except HTTPException, e:
            return e

    def wsgi_app(self, environ, start_response):
        request = Request(environ)
        response = self.dispatch_request(request)
        return response(environ, start_response)

    def __call__(self, environ, start_response):
        return self.wsgi_app(environ, start_response)


class ExpressionController(object):
    def __init__(self):
        pass

    def list(self, request, args):
        return Response('Expression Controller List Method with arguments %r' %(args))

    def show(self, request, args):
        return Response('Expression Controller Show Method with arguments %r' %(args))

class UserController(object):
    def expr_index(self, request, args):
        return Response('User Controller expr_index method with args %r' %(args))

class AdminController(object):
    def default(self, request, args):
        return Response('Admin Controller default method with args %r' %(args))

class AnalyticsController(object):
    pass

if __name__ == '__main__':
    from werkzeug.serving import run_simple
    app = Newhive({'port': 1818})
    run_simple('0.0.0.0', 1818, app, use_debugger=True, use_reloader=True)

