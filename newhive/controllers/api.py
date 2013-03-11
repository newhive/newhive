import json
from werkzeug import Request, Response
from collections import namedtuple
from newhive.controllers import Application
from newhive.controllers.shared import PagingMixin
from newhive import auth, config, oauth
from newhive import state


class Api(Application, PagingMixin):
    def __init__(self, **args):
        super(Api, self).__init__(**args)
        self.api_routes = {
            'expressions/featured': self.api_expr_featured
         }
        self.dummyObj = {
            'key': 'val'
        }
    def index(self, request, response):
        route = '/'.join(request.path_parts[1:])
        controller = lget(self.api_routes,route)
        if controller:
            return controller(request, response)
        else:
            return self.serve_404(request, response)
    def api_expr_featured(self, request, response):
        return self.serve_json(response, response.context.get('cards'))
        # return super(PagingMixin, self).expr_featured(**args)
    def serve_404(self, request, response):
        response.status_code = 404
        return self.serve_json(response, {
            'error': 404
        })


# Maybe instead use this for more explicitness: TransactionData = namedtuple('RequestMeta' 'user ...')
class TransactionData(object):
    """ Put stuff in one of these that doesn't really go in either the request or response,
    but is specific to a request / response """
    pass

class Controller(object):
    def __init__(self, db=None, jinja_env=None, assets=None, config=None):
        self.config = config
        self.db = db
        self.jinja_env = jinja_env
        self.assets = assets

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
        # werkzeug provides form data as immutable dict, so it must be copied to be properly mutilated
        response.context = { 'f' : dict(request.form.items()), 'q' : request.args, 'url' : request.url }
        tdata.user = auth.authenticate_request(self.db, request, response)
        return (tdata, response)

    def serve_data(self, response, mime, data):
        response.content_type = mime
        response.data = data
        return response

    def serve_json(self, response, val, as_text = False):
        """ as_text is used when content is received in an <iframe> by the client """
        return self.serve_data(response, 'text/plain' if as_text else 'application/json', json.dumps(val))

    def serve_404(self, request, response):
        response.status_code = 404
        return self.serve_json(response, {
            'error': 404
        })

class ModelController(Controller):
    model_name = None # str of newhive.state class name that a type of controller is most related to
    model = None

    def __init__(self, **args):
        super(ModelController, self).__init__(**args)
        self.model = getattr(args['db'], self.model_name)

    def fetch(self, tdata, request, response, id=None):
        """ Fetch a record from any newhive.state model """
        data = self.model.fetch(id)
        if data is None: self.serve_404(request, response)
        return self.serve_json(response, data)

class Expr(ModelController):
    model_name = 'Expr'

class User(ModelController):
    model_name = 'User'

# convenience class for instantiating all da controllers at once
class Controllers(object):
    def __init__(self, server_env):
        for k in [Expr, User]:
            setattr(self, k.__name__.lower(), k(**server_env))