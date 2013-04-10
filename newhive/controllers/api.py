import json
from werkzeug import Request, Response
import httplib2, urllib
from collections import namedtuple
from newhive.utils import dfilter
from newhive.controllers import Application

from newhive.controllers.shared import PagingMixin
from newhive import auth, config, oauth, state
from newhive.utils import abs_url

class Controllers(object):
    """ Convenience class for instantiating all da controllers at once. """
    controllers = []

    def __init__(self, server_env):
        for k in self.__class__.controllers:
            setattr(self, k.__name__.lower(), k(**server_env))

    @classmethod
    def register(this_class, that_class):
        this_class.controllers.append(that_class)
        return that_class

# Maybe instead use this for more explicitness: TransactionData = namedtuple('RequestMeta' 'user ...')
class TransactionData(object):
    """ One of these is associated with each request cycle to put stuff in
    that doesn't really go in either the Request or Response objects """
    pass

class Controller(object):
    def __init__(self, db=None, jinja_env=None, assets=None, config=None):
        self.config = config
        self.db = db
        self.jinja_env = jinja_env
        self.assets = assets
        self.asset = self.assets.url

    def dispatch(self, handler, request, **args):
        (tdata, response) = self.pre_process(request)
        return getattr(self, handler)(tdata, request, response, **args)

    def pre_process(self, request):
        """ Do necessary stuffs for every request, specifically:
                * Construct Response and TransactionData objects.
                * Authenticate request, and if given credentials, set auth cookies
            returns (TransactionData, Response) tuple
                """

        response = Response()
        tdata = TransactionData()
        tdata.user = auth.authenticate_request(self.db, request, response)
        request.path_parts = request.path.split('/')

        # werkzeug provides form data as immutable dict, so it must be copied to be properly mutilated
        # the context is for passing to views to render a response.
        # The f dictionary of form fields may be left alone to mirror the request, or validated and adjusted
        response.context = { 'f' : dict(request.form.items()), 'q' : request.args, 'url' : request.url,
                            'home_url': tdata.user.get_url(), 'user': tdata.user, 'server_url': abs_url(),
                            'config': config, 'secure_server': abs_url(secure = True),
                            'server_name': config.server_name, 'debug': config.debug_mode, 
                            'content_domain': abs_url(domain = config.content_domain),
                            'beta_tester': config.debug_mode or tdata.user.get('name') in config.beta_testers}
        request.path_parts = request.path.split('/')
        return (tdata, response)
    
    def render_template(self, tdata, response, template):
        context = response.context
        context.update(template = template)
        context.setdefault('icon', self.asset('skin/1/logo.png'))
        return self.jinja_env.get_template(template).render(context)

    def serve_data(self, response, mime, data):
        response.content_type = mime
        response.data = data
        return response

    def serve_html(self, response, html):
        return self.serve_data(response, 'text/html; charset=utf-8', html)

    def serve_page(self, tdata, response, template):
        return self.serve_html(response, self.render_template(tdata, response, template))

    def serve_json(self, response, val, as_text = False):
        """ as_text is used when content is received in an <iframe> by the client """
        return self.serve_data(response, 'text/plain' if as_text else 'application/json', json.dumps(val))
        
    def serve_loader_page(self, template, tdata, request, response):
        return self.serve_html(response, self.render_template(tdata, response, template))

    def serve_404(self, request, response):
        response.status_code = 404
        return self.serve_json(response, {
            'error': 404
        })
        
    def redirect(self, response, location, permanent=False):
        response.location = str(location)
        response.status_code = 301 if permanent else 303
        return response

class ModelController(Controller):
    """ Base class for all controllers tied to one of our DB collections """

    # str of newhive.state class name that a type of controller is most
    # related to. Set this in child class so instances get the appropriate
    # model attribute when constructed.
    model_name = None 

    model = None # model object

    def __init__(self, **args):
        super(ModelController, self).__init__(**args)
        self.model = getattr(args['db'], self.model_name)

    def fetch(self, tdata, request, response, id=None):
        """ Fetch a record from any newhive.state model """
        data = self.model.fetch(id)
        if data is None: self.serve_404(request, response)
        return self.serve_json(response, data)

from functools import partial
@Controllers.register
class Community(Controller):
    def home_feed(self, tdata, request, username, **paging_args):
        return {
            "cards": tdata.user.feed_network(**paging_args),
            "title": ("The Hive", "Featured")
        }

    def expressions_public(self, tdata, request, username, **paging_args):
        return {
            "cards": tdata.user.expr_page(
                        auth='public',
                        viewer=tdata.user, **paging_args),
            "title": ("My Expressions", "Public")
        }

    def dispatch(self, handler, request, **kwargs):
        (tdata, response) = self.pre_process(request)
        query = getattr(self, handler, None)
        if query is None:
            return self.serve_404()
        # Handle keyword args to be passed to the controller function
        passable_keyword_args = dfilter(kwargs,['username'])
        # Handle pagination
        pagination_args = dfilter(request.args, ['at', 'limit', 'sort', 'order'])
        for k in ['limit', 'order']:
            if k in pagination_args: pagination_args[k] = int(pagination_args[k])
        # Call controller function with query and pagination args
        page_data = query(tdata, request, **(dict(passable_keyword_args.items() + pagination_args.items())))
        page_data['cards'] = [o.client_view() for o in page_data['cards']]
        page_data['title'] = page_data['title']
        if kwargs.get('json'):
            return self.serve_json(response, page_data)
        else:
            response.context.update({
                "page_data": page_data
            })
            return self.serve_loader_page('pages/community.html', tdata, request, response)

    def profile(self, tdata, request, response, username=None):
        return self.serve_page(tdata, response, 'pages/nav_stub.html')

@Controllers.register
class Expr(ModelController):
    # Putting imports here for now because eventually Expr will get its own file
    import werkzeug.urls
    import uuid
    from md5 import md5
    import subprocess
    import os
    model_name = 'Expr'
    def expr_to_html(self, exp):
        """Converts JSON object representing an expression to HTML"""
        if not exp: return ''

        def css_for_app(app):
            css = {
                    'left': app['position'][0]
                    , 'top': app['position'][1]
                    , 'z-index': app['z']
                    , 'width': app['dimensions'][0]
                    , 'height': app['dimensions'][1]
                    , 'opacity': app.get('opacity', 1)
                    , 'font-size': app.get('scale')
                    }
            rv = "left: {left}px; top: {top}px; z-index: {z-index}; opacity: {opacity};".format(**css)
            if not app.get('type') == 'hive.raw_html':
                rv += "width: {width}px; height: {height}px; ".format(**css)
            if app.get('scale'):
                rv += "font-size: {font-size}em;".format(**css)
            return rv

        def html_for_app(app):
            content = app.get('content', '')
            more_css = ''
            type = app.get('type')
            id = app.get('id', app['z'])
            if type == 'hive.image':
                html = "<img src='%s'>" % content
                link = app.get('href')
                if link: html = "<a href='%s'>%s</a>" % (link, html)
            elif type == 'hive.sketch':
                html = "<img src='%s'>" % content.get('src')
            elif type == 'hive.rectangle':
                c = app.get('content', {})
                more_css = ';'.join([p + ':' + str(c[p]) for p in c])
                html = ''
            elif type == 'hive.html':
                html = ""
            else:
                html = content
            data = " data-angle='" + str(app.get('angle')) + "'" if app.get('angle') else ''
            data += " data-scale='" + str(app.get('scale')) + "'" if app.get('scale') else ''
            return "<div class='happ %s' id='app%s' style='%s'%s>%s</div>" %\
                (type.replace('.', '_'), id, css_for_app(app) + more_css, data, html)

        app_html = map( html_for_app, exp.get('apps', []) )
        if exp.has_key('dimensions'):
            app_html.append("<div id='expr_spacer' class='happ' style='top: {}px;'></div>".format(exp['dimensions'][1]))
        if exp.has_key('fixed_width'):
            app_html = ['<div class="expr_container" style="width: {}px">'.format(exp['fixed_width'])] + \
                app_html + ['</div>']
        return ''.join(app_html)
    def fetch(self, tdata, request, response, user, expr):
        expr_obj = self.db.Expr.named(user,expr)
        return self.serve_json(response,expr_obj)
    def fetch_naked(self, tdata, request, response, expr_id):
        print "host_url: ", request.host_url
        # Request must come from content_domain, as this serves untrusted content
        # TODO: get routing to take care of this
        if request.host.split(':')[0] != config.content_domain:
            return self.redirect('/')
        expr_obj = self.db.Expr.fetch(expr_id)
        response.context.update(
                html = self.expr_to_html(expr_obj)
                , expr = expr_obj
                , use_ga = False
                , expr_script = expr_obj.get('script')
                , expr_style = expr_obj.get('style'))
        return self.serve_page(tdata, response, 'pages/expr.html')
    
@Controllers.register
class User(ModelController):
    model_name = 'User'

    def streamified_login(self, tdata, request, response):
        streamified_username = request.args['usernames'].split(',')[0]

        post = {
            'code': request.args['code'],
            'grant_type': 'authorization_code',
            'redirect_uri': abs_url(secure=True) + 'streamified_login',
            'scope': streamified_username,
            'client_id': config.streamified_client_id,
            'client_secret': config.streamified_client_secret,
        }
        headers = { 'content-type': 'application/x-www-form-urlencoded', }

        body = urllib.urlencode(post)
        print config.streamified_url + 'oauth/access_token', body
        http = httplib2.Http(timeout=0.5, disable_ssl_certificate_validation=True)
        resp, content = http.request(config.streamified_url + 'oauth/access_token',
            method='POST', body=body, headers=headers)

        print (resp, content)
        
        return self.serve_page(tdata, response, 'pages/streamified_login.html')

    def streamified_test(self, tdata, request, response):
        return self.serve_page(tdata, response, 'pages/streamified_test.html')

# maybe make this inherit from ModelController if based off a MongoDB
# collection, otherwise if implemented with Elastic Search or similar, it
# should stay like this.
@Controllers.register
class Search(Controller):
    pass
