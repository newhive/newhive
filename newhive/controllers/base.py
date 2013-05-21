import json
from werkzeug import Request, Response
from collections import namedtuple
from newhive.utils import dfilter
from newhive import auth, config, utils
from newhive.utils import abs_url

class TransactionData(utils.FixedAttrs):
    """ One of these is associated with each request cycle to put stuff in
        (that Werkzeug's Request or Response objects don't already handle) """
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
        return getattr(self, handler, None)(tdata, request, response, **args)

    def pre_process(self, request):
        """ Do necessary stuffs for every request, specifically:
                * Construct Response and TransactionData objects.
                * Authenticate request, and if given credentials, set auth cookies
            returns (TransactionData, Response) tuple """

        response = Response()
        anon = self.db.User.new({})
        tdata = TransactionData(user=anon, context=dict(
            user=anon, config=config, debug=config.debug_mode,
            # Werkzeug provides form data as immutable dict, so it must be copied
            # fields may be left alone to mirror the request, or validated and normalized
            form=dict(request.form.items()), error={},
            query=request.args, url=request.url,
            server_name=config.server_name, 
            server_url=abs_url(), secure_server=abs_url(secure = True),
            link_url=abs_url(secure=request.is_secure),
            content_domain=abs_url(domain = config.content_domain),
            content_server_url=abs_url(domain=config.content_domain),
            secure_content_server_url=abs_url(domain=config.content_domain,secure=True),
            is_secure=request.is_secure
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

    def serve_forbidden(self, tdata, request, response, json=True):
        response = Response()
        response.status_code = 403
        return self.serve_text(response, 'Sorry, not going to do that. Perhaps you are not logged in, or not using https?')

    def serve_500(self, request, response, exception=None, json=True):
        if config.debug_mode: raise exception

        response.status_code = 404
        if json: return self.serve_json(response, {'error': 500 })
        else:
            tdata = TransactionData(user=self.db.User.new({}), context={})
            return self.serve_page(tdata, response, 'pages/exception.html')

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

def auth_required(controller_method):
    def decorated(self, tdata, *args, **kwargs):
        if not tdata.user.logged_in:
            return self.serve_forbidden(tdata, *args)
        return controller_method(self, tdata, *args, **kwargs)
    return decorated
