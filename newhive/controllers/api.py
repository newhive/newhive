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
             'search'                     : self.search
            ,'expressions'           : self.expr_featured
            ,'home/expressions/all'       : self.expr_all
            ,'network'               : self.home_feed
            ,'people'                : self.people
            ,'page'                  : self.expr_page
            ,'profile/expressions'        : self.user_exprs
            ,'profile/expressions/public' : partial( self.user_exprs, auth='public' )
            ,'profile/expressions/private': partial( self.user_exprs, auth='password' )
            ,'profile/activity'           : self.feed_activity
            ,'profile/activity/like'      : partial( self.feed_activity, by_owner=True,
                spec={'class_name':'Star', 'entity_class':'Expr'} )
            ,'profile/activity/discussion': partial( self.feed_activity,
                spec={'class_name':'Comment'} )
            ,'profile/activity/broadcast' : partial( self.feed_activity,
                by_owner=True, spec={'class_name':'Broadcast'} )
            ,'profile/activity/network'   : self.feed_network
            ,'profile/listening'          : self.listening
            ,'profile/listening/listeners': self.listeners
         }
        self.dummyObj = {
            'key': 'val'
        }
    def index(self, request, response):
        route = '/'.join(request.path_parts[1:])
        controller = lget(self.api_routes,route)
        if controller:
            controller(request, response)
            return self.serve_json(response, response.context.get('cards'))
        else:
            return self.serve_404(request, response)
    def expr_page(self, request, response):
        page = lget(request.path_parts, 2, 'about')
        response.context.update({
            'title': page,
            'content': self.expr_to_html( self.db.Expr.named(
                config.site_user, lget(request.path_parts, 2, 'about') ) )
        })
    def serve_404(self, request, response):
        response.status_code = 404
        return self.serve_json(response, {
            'error': 404
        })