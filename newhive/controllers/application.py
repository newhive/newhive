from newhive.controllers.shared import *
from newhive import auth, config
from werkzeug import Response

class ApplicationController(object):
    def __init__(self, jinja_env, assets_env, db):
        self.jinja_env = jinja_env
        self.assets_env = assets_env
        self.db = db
        self.content_domain = config.content_domain

    def default(self, request, response):
        method = request.path_parts[0]
        return getattr(self, method)(request, response)

    def serve_data(self, response, mime, data):
        response.mimetype = 'mime'
        response.data = data
        return response

    def serve_html(self, response, html):
        return self.serve_data(response, 'text/html; charset=utf-8', html)

    def serve_page(self, response, template):
        return self.serve_html(response, self.render_template(response, template))
    def page(self, template):
        return lambda request, response: self.serve_page(response, template)

    def render_template(self, response, template):
        context = response.context
        context.update(
             home_url = response.user.get_url()
            ,feed_url = response.user.get_url(path='profile/activity')
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
            ,template = template
            )
        context.setdefault('icon', '/lib/skin/1/logo.png')
        return self.jinja_env.get_template(template).render(context)

    def serve_json(self, response, val, as_text = False):
        """ as_text is used when content is received in an <iframe> by the client """
        return self.serve_data(response, 'text/plain' if as_text else 'application/json', json.dumps(val))

    def serve_404(self, request, response):
        response.status_code = 404
        return self.serve_page(response, 'pages/notfound.html')

    def serve_error(self, request, msg, code=500):
        response = Response()
        response.status_code = 500
        response.context['msg'] = msg
        return self.serve_page(response, 'pages/error.html')

    def redirect(self, response, location, permanent=False):
        response.location = location
        response.status_code = 301 if permanent else 303
        return response

    def robots(self, request, response):
        if config.debug_mode:
            return self.serve_data(response, 'text/plain', "User-agent: *\nDisallow: /")
        else: return self.serve_404(None, response)
