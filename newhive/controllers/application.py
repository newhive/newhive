from newhive.controllers.shared import *
from newhive import auth, config
from werkzeug import Response

class ApplicationController(object):
    def __init__(self, jinja_env, assets_env, db):
        self.jinja_env = jinja_env
        self.assets_env = assets_env
        self.db = db
        self.content_domain = config.content_domain

    def pre_process(self, request, args={}):
        response = Response()
        request.requester = auth.authenticate_request(self.db, request, response)
        response.context = { 'f' : request.form, 'q' : request.args, 'url' : request.url }
        response.user = request.requester
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'x-requested-with')

        request.path = request.path[1:] # drop leading '/'
        request.domain = request.host.split(':')[0].lower()
        return (request, response)

    def default(self, request, response, args):
        if not args.has_key('method'): raise "Default Method must include 'args' argument with key 'method'"
        method = args['method'].split('/')[0] #TODO: remove this method splitting hack once full routing is in place
        return getattr(self, method)(request, response)

    def serve_html(self, response, html):
        response.data = html
        response.content_type = 'text/html; charset=utf-8'
        return response

    def serve_page(self, response, template):
        return self.serve_html(response, self.render_template(response, template))

    def render_template(self, response, template):
        context = response.context
        context.update(
             home_url = response.user.get_url()
            ,feed_url = response.user.get_url(path='feed')
            ,user = response.user
            ,admin = response.user.get('name') in config.admins
            ,create = abs_url(secure = True) + 'edit'
            ,server = abs_url()
            ,secure_server = abs_url(secure = True)
            ,server_name = config.server_name
            ,site_pages = dict([(k, abs_url(subdomain=config.site_user) + config.site_pages[k]) for k in config.site_pages])
            ,colors = colors.colors
            ,debug = config.debug_mode
            ,assets_env = self.assets_env
            ,use_ga = config.use_ga
            ,ui = ui
            )
        context.setdefault('icon', '/lib/skin/1/logo.png')
        return self.jinja_env.get_template(template).render(context)

    def serve_json(self, response, val, as_text = False):
        """ as_text is used when content is received in an <iframe> by the client """

        response.mimetype = 'application/json' if not as_text else 'text/plain'
        response.data = json.dumps(val)
        return response

    def serve_404(self, request, response):
        response.status_code = 404
        return self.serve_page(response, 'pages/notfound.html')

    def serve_error(self, request, msg):
        response.status_code = 500
        response.context['msg'] = msg
        return self.serve_page(response, 'pages/error.html')

    def redirect(self, response, location, permanent=False):
        response.location = location
        response.status_code = 301 if permanent else 303
        return response
