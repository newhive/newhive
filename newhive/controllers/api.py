import json
from werkzeug import Request, Response
import httplib2, urllib
from collections import namedtuple
from newhive.utils import dfilter
from newhive.controllers import Application

from newhive import auth, config, oauth, state, utils
from newhive.utils import abs_url, url_host

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

class TransactionData(utils.FixedAttrs):
    """ One of these is associated with each request cycle to put stuff in
        (that Werkzeug's Request or Response objects don't already handle) """
    pass

@Controllers.register
class Controller(object):
    def __init__(self, db=None, jinja_env=None, assets=None, config=None):
        self.config = config
        self.db = db
        self.jinja_env = jinja_env
        self.assets = assets
        self.asset = self.assets.url

    def dispatch(self, handler, request, **args):
        (tdata, response) = self.pre_process(request)
        return getattr(self, handler, None)(tdata, request, response, **args)

    def pre_process(self, request):
        """ Do necessary stuffs for every request, specifically:
                * Construct Response and TransactionData objects.
                * Authenticate request, and if given credentials, set auth cookies
            returns (TransactionData, Response) tuple """

        response = Response()
        anon = self.db.User.new({})
        print "request: ", request.is_secure
        tdata = TransactionData(user=anon, context=dict(
            user=anon, config=config, debug=config.debug_mode,
            # Werkzeug provides form data as immutable dict, so it must be copied
            # fields may be left alone to mirror the request, or validated and normalized
            form=dict(request.form.items()), error={},
            query=request.args, url=request.url,
            link_url=abs_url(secure=request.is_secure),
            server_name=config.server_name, 
            server_url=abs_url(), secure_server=abs_url(secure = True),
            content_domain=abs_url(domain = config.content_domain),
            content_server_url=abs_url(domain=config.content_domain),
            secure_content_server_url=abs_url(domain=config.content_domain,secure=True)
        ) )

        authed = auth.authenticate_request(self.db, request, response)
        if type(authed) == self.db.User.entity:
            tdata.user = tdata.context['user'] = authed
        elif isinstance(authed, Exception):
            tdata.context['error']['login'] = True
        tdata.context.update(beta_tester=
            config.debug_mode or tdata.user.get('name') in config.beta_testers)

        return (tdata, response)
    
    def render_template(self, tdata, response, template):
        context = tdata.context
        context.update(template=template)
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

    def serve_404(self, tdata, request, response, json=True):
        response.status_code = 404
        if json: return self.serve_json(response, {'error': 404 })
        else: return self.serve_page(tdata, response, 'pages/notfound.html')

    def serve_500(self, request, response, exception=None, json=True):
        if config.debug_mode: raise exception

        response.status_code = 404
        if json: return self.serve_json(response, {'error': 500 })
        else:
            tdata = TransactionData(user=self.db.User.new({}), context={})
            return self.serve_page(tdata, response, 'pages/broken.html')

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
        if data is None: self.serve_404(tdata, request, response)
        return self.serve_json(response, data)

@Controllers.register
class Community(Controller):
    def network_trending(self, tdata, request, username=None, **paging_args):
        return {
            'page_data': {
                'cards': tdata.user.feed_network(**paging_args),
                'header': ("The Hive", "Trending"),
            },
            'title': "Network - Trending",
        }

    def network_recent(self, tdata, request, username=None, **paging_args):
        return {
            'page_data': {
                "cards": tdata.user.feed_network(**paging_args),
                "header": ("Network", "Recent")
            },
            "title": 'Network - Recent',
        }

    def expressions_public(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.fetch(owner_name, 'name')
        if not owner: return None
        spec = {'owner_name': owner_name}
        cards = self.db.Expr.page(spec, tdata.user, **args)
        return {
            'page_data': { "cards": cards, },
            'title': 'Expressions by ' + owner['name'],
        }
    def expressions_private(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.fetch(owner_name, 'name')
        if not owner: return None
        spec = {'owner_name': owner_name, 'auth': 'private'}
        cards = self.db.Expr.page(spec, tdata.user, **args)
        return {
            'page_data': { "cards": cards, },
            'title': 'Your Private Expressions',
        }

    def user_home(self, tdata, request, owner_name=None, **args):
        # show home expression or redirect to home 
        return {}

    def expr(self, tdata, request, owner_name=None, expr_name=None, **args):
        print "in expr!"
        expr_obj = self.db.Expr.named(owner_name, expr_name)
        return {
            'page_data': {
                'expr_id': expr_obj['_id']
            },
            'title' :''
        }

    def dispatch(self, handler, request, **kwargs):
        (tdata, response) = self.pre_process(request)
        query = getattr(self, handler, None)
        if query is None:
            return self.serve_404(tdata, request, response, json=kwargs.get('json'))
        # Handle keyword args to be passed to the controller function
        passable_keyword_args = dfilter(kwargs, ['owner_name', 'expr_name'])
        # Handle pagination
        pagination_args = dfilter(request.args, ['at', 'limit', 'sort', 'order'])
        for k in ['limit', 'order']:
            if k in pagination_args: pagination_args[k] = int(pagination_args[k])
        # Call controller function with query and pagination args
        merged_args = dict(passable_keyword_args.items() + pagination_args.items())
        tdata.context.update({'route_info': kwargs})
        context = query(tdata, request, **merged_args)
        if not context:
            return self.serve_404(tdata, request, response, json=kwargs.get('json'))
        if context['page_data'].get('cards'):
            cards = context['page_data']['cards']
            context['page_data']['cards'] = [o.client_view() for o in cards]
        if kwargs.get('json'):
            return self.serve_json(response, context)
        else:
            tdata.context.update(context=context)
            return self.serve_loader_page('pages/main.html', tdata, request, response)        

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
        tdata.context.update(
                html = self.expr_to_html(expr_obj)
                , expr = expr_obj
                , use_ga = False
                , expr_script = expr_obj.get('script')
                , expr_style = expr_obj.get('style'))
        return self.serve_page(tdata, response, 'pages/expr.html')
    
@Controllers.register
class User(ModelController):
    model_name = 'User'

    def login(self, tdata, request, response):
        authed = auth.handle_login(self.db, request, response)
        if type(authed) == self.db.User.entity: resp = authed.client_view()
        else: resp = False
        return self.serve_json(response, resp)

    def logout(self, tdata, request, response):
        auth.handle_logout(self.db, tdata.user, request, response)
        return self.serve_json(response, True)

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
