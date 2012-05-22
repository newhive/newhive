from newhive.controllers.shared import *
from newhive import auth, config, oauth
from werkzeug import Response
from newhive.oauth import FacebookClient
import newhive.utils
from newhive.utils import b64decode
import logging
logger = logging.getLogger(__name__)

class ApplicationController(object):
    def __init__(self, jinja_env, assets_env, db):
        self.jinja_env = jinja_env
        self.assets_env = assets_env
        self.db = db
        self.content_domain = config.content_domain
        self.fb_client = FacebookClient()

    def pre_process(self, request):
        request = newhive.utils.Request(request)
        request.environ['hive.request'] = request
        request.environ['wsgi.url_scheme'] = request.headers.get('X-Forwarded-Proto', request.environ['wsgi.url_scheme'])
        original_url = request.url
        if config.dev_prefix:
            request.environ['HTTP_HOST'] = request.environ.get('HTTP_HOST', '').replace(config.dev_prefix + '.', '')
        response = Response()
        # werkzeug provides form data as immutable dict, so it must be copied to be properly mutilated
        response.context = { 'f' : dict(request.form.items()), 'q' : request.args, 'url' : original_url }
        request.requester = auth.authenticate_request(self.db, request, response)
        self.process_facebook(request)
        if request.args.has_key('code') and not request.form.get('fb_disconnect'):
            if request.requester.logged_in:
                # if logged in, then connect facebook account if not already connected
                if not request.requester.has_facebook:
                    credentials = request.requester.fb_client.exchange()
                    profile = request.requester.fb_client.me()
                    # Don't save credentials if a user already exists with this facebook id
                    existing_user = self.db.User.find_by_facebook(profile.get('id'))
                    if not existing_user:
                        logger.info("Connecting facebook account '%s' to TNH account '%s'", profile['name'], request.requester['name'])
                        request.requester.save_credentials(request.requester.fb_client.exchange(), profile=True)
                        response.context['new_fb_connect'] = True
                    else:
                        logger.warn("Not connecting facebook account '%s' to TNH account '%s' because account is already connected to '%s'",
                                                                         profile['name'], request.requester['name'], existing_user['name'])
                        response.context['dialog_to_show'] = '#dia_fb_account_duplicate'
                        response.context['existing_user'] = existing_user
                        response.context['facebook_name'] = profile['name']
            else:
                # if not logged in, try logging in with facebook credentials
                fb_client = request.requester.fb_client
                request.requester = auth.facebook_login(self.db, request, response)
                fb_client.user = request.requester
                request.requester.fb_client = fb_client
                if not request.requester.id:
                    response.context['dialog_to_show'] = '#dia_sign_in_or_join'
        response.context.update(facebook_authentication_url=self.fb_client.authorize_url(request.base_url))
        response.user = request.requester
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'x-requested-with')

        request.path = request.path.strip('/') # drop leading and trailing '/'s
        request.domain = request.host.split(':')[0].lower()
        return (request, response)

    def default(self, request, response):
        method = lget(request.path_parts, 1, '_index')
        if not hasattr(self, method): return self.serve_404(request, response)
        return getattr(self, method)(request, response)

    def serve_data(self, response, mime, data):
        response.content_type = mime
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
            ,beta_tester = config.debug_mode or response.user.get('name') in config.beta_testers
            ,create = abs_url(secure = True) + 'edit'
            ,server = abs_url()
            ,secure_server = abs_url(secure = True)
            ,server_name = config.server_name
            ,site_pages = dict([(k, abs_url(subdomain=config.site_user) + config.site_pages[k]) for k in config.site_pages])
            ,debug = config.debug_mode
            ,assets_env = self.assets_env
            ,use_ga = config.use_ga
            ,ui = ui
            ,template = template
            ,facebook_app_id = config.facebook_app_id
            )
        if response.user.flagged('fb_connect_dialog'):# and not response.user.has_facebook:
            dia_opts = """{
                open: function(){
                    $('#user_menu_handle').click();
                    _gaq.push(['_trackEvent', 'fb_connect', 'open_connect_dialog', 'auto']);
                }
                , minimize_to: '#user_menu_handle'}"""
            context.update(dialog_to_show = '#dia_facebook_connect', dialog_to_show_opts=dia_opts)
            response.user.unflag('fb_connect_dialog')
        context.setdefault('icon', '/lib/skin/1/logo.png')
        return self.jinja_env.get_template(template).render(context)

    def serve_json(self, response, val, as_text = False):
        """ as_text is used when content is received in an <iframe> by the client """
        return self.serve_data(response, 'text/plain' if as_text else 'application/json', json.dumps(val))

    def serve_text(self, response, text):
        return self.serve_json(response, text, as_text=True)

    def serve_404(self, request, response):
        response.status_code = 404
        return self.serve_page(response, 'pages/notfound.html')

    def serve_error(self, request, msg, code=500):
        request, response = self.pre_process(request)
        response.status_code = 500
        response.context['msg'] = msg
        return self.serve_page(response, 'pages/error.html')

    def serve_forbidden(self, request):
        response = Response()
        response.status_code = 403
        return self.serve_text(response, 'That action is only available to logged in users.')

    def redirect(self, response, location, permanent=False):
        response.location = location
        response.status_code = 301 if permanent else 303
        return response

    def robots(self, request, response):
        if config.debug_mode:
            return self.serve_data(response, 'text/plain', "User-agent: *\nDisallow: /")
        else: return self.serve_404(None, response)

    def process_facebook(self, request):
        # in order to get facebook credentials we use the following order of
        # preference:
        # 
        # 1) use token stored in user record if still valid
        # 2) get new token from fbsr cookie set by fb js sdk
        # 3) if absolutely necessary get new token via redirect
        user = request.requester
        fb_cookie = self._get_fb_cookie(request)
        user.fb_client = FacebookClient(user=user)

        # if the user object has stored credentials from the database and they are
        # still valid, give these to the fb_client
        if user.facebook_credentials and not user.facebook_credentials.access_token_expired:
            user.fb_client.credentials = user.facebook_credentials

        # If user object has no valid credentials, and also as a backup, we store an
        # oauth code, which can be exchanged later for an access token.  if the
        # request includes a code in the argument, prefer this, because it probably
        # just came from facebook via a redirect, rather than the cookie set by the
        # javascript sdk, which could be older
        if request.args.has_key('code'):
            user.fb_client.add_auth(request.args['code'], request.base_url)
        if fb_cookie and fb_cookie.get('user_id') == user.facebook_id:
            user.fb_client.add_auth(fb_cookie.get('code'), '')

    def _get_fb_cookie(self, request):
        cookie = auth.get_cookie(request, 'fbsr_' + config.facebook_app_id)
        if cookie:
            sig, data = [b64decode(str(el)) for el in cookie.split('.')]
            #TODO: check data against signature hash
            return json.loads(data)
        else:
            return None