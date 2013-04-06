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
                            'user': tdata.user, 'server_url': abs_url(),
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
    def community_page(self, tdata, request, response, username, method, id=None, as_json=False):
        methods = {
            "home_feed": {
                "query": tdata.user.feed_network,
                "title": ("The Hive", "Featured")
            },
            "expressions_public": {
                "query": partial(tdata.user.expr_page,
                            auth='public',
                            viewer=tdata.user),
                "title": ("My Expressions", "Public")
            }
        }
        page = methods.get(method)
        if page is None:
            return self.serve_404()
        cards = page['query']()
        cards = map(lambda o: o.client_view(),cards)
        page_data = {}
        page_data['cards'] = cards
        page_data['title'] = page['title']
        if as_json:
            return self.serve_json(response, page_data)
        else:
            response.context.update({
                "page_data": page_data
            })
            return self.serve_loader_page('pages/community.html', tdata, request, response)        

    def index(self, tdata, request, response):
        """ Generic handler for retrieving paginated lists of a collection """

        args = dfilter(request.args, ['at', 'limit', 'sort', 'order'])
        for k in ['limit', 'order']:
            if k in args: args[k] = int(args[k])
        # pass off actual querying of model to specific ModelController
        items = self.page(tdata, **args)
        return self.serve_json(response, items)

    # this can be overridden in derived classes to add behavior that doesn't belong in the model
    def page(self, tdata, **args):
        return self.model.page({}, tdata.user, **args)
        
    def profile(self, tdata, request, response, username=None):
        return self.serve_page(tdata, response, 'pages/main.html')

@Controllers.register
class Expr(ModelController):
    # Putting imports here for now because eventually Expr will get its own file
    import werkzeug.urls
    import uuid
    from md5 import md5
    import subprocess
    import os
    model_name = 'Expr'
    def fetch(self):
        pass
    def thumb(self, tdata, request, response, id=None):
        """
        convert expression to an image (make a screenshot). depends on https://github.com/AdamN/python-webkit2png
        """
        eid = request.form.get('entity')
        entity = self.model.fetch(id)
        if not entity: return self.serve_404(request, response)
        if entity.get('screenshot'):
            return self.serve_json(response, entity.get('screenshot'))
        link = werkzeug.urls.url_fix("http://%s:%d/%s/%s" % (config.server_name, config.plain_port, entity['owner_name'], entity['name']))
        fileID = "/tmp/%s" % md5(str(uuid.uuid4())).hexdigest()
        filename = fileID + '-full.png'
        subprocess.Popen(["webkit2png", link, "-F", "-o", fileID]).wait()
        with open(filename) as f:
            # TODO: Find out what's up with owner=request.requester.id,
            file_res = self.db.File.create(dict(owner=' ',tmp_file=f, name='expr_screenshot', mime='image/png'))
            screenshotData = {'screenshot' : {'file_id': file_res['_id']}}
            entity.update(**screenshotData)

        os.remove(filename)
        
        return self.serve_json(response, screenshotData)
    
@Controllers.register
class User(ModelController):
    model_name = 'User'

    def authenticate(self, tdata, request, response):
        user = auth.handle_login(self.db, request, response)
        if user: user = user.client_view()
        return self.serve_json(response, user)

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
