from newhive.controllers import Application
from newhive.controllers.shared import *
from newhive import auth, config, oauth
from werkzeug import Response
from newhive.oauth import FacebookClient
import newhive.utils
from newhive.utils import b64decode
import logging
logger = logging.getLogger(__name__)

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