import httplib2, urllib, datetime, json

from apiclient.discovery import build
from apiclient.http import BatchHttpRequest
from oauth2client.file import Storage
from oauth2client.client import OAuth2WebServerFlow, OAuth2Credentials, FlowExchangeError, AccessTokenCredentialsError
from oauth2client import tools

from newhive import config
from newhive.utils import abs_url
from ssl import SSLError

import logging
logger = logging.getLogger(__name__)

class FacebookClient(object):

    def __init__(self, code=None, redirect_uri=None, user=None):
        self.client_id = config.facebook_app_id
        self.client_secret = config.facebook_client_secret
        self.scope = 'email'
        self.auth_uri = 'https://www.facebook.com/dialog/oauth'
        self.token_uri = 'https://graph.facebook.com/oauth/access_token'
        self.default_redirect_uri = abs_url(secure=True)
        self.user_agent = None
        self._access_token = None
        self.redirect_uri = redirect_uri
        self.code = code
        self.user = user
        if code and redirect_uri != None:
            self.auth = [{'code': code, 'redirect_uri': redirect_uri}]
        else: self.auth = []
        self._credentials = None

        self.flow = OAuth2WebServerFlow(
                client_id=self.client_id
                , client_secret=self.client_secret
                , scope=self.scope
                , auth_uri = self.auth_uri
                , token_uri = self.token_uri
                )

    def authorize_url(self, redirect_url):
        body = urllib.urlencode({
            'client_id': self.client_id
            , 'redirect_uri': redirect_url
            , 'scope': self.scope
            })
        return self.auth_uri + "?" + body

    @property
    def access_token(self):
        if not self._access_token:
            http = httplib2.Http()
            body = urllib.urlencode({
                'grant_type': 'client_credentials',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'redirect_uri': self.default_redirect_uri
                })
            resp, content = http.request(self.token_uri + "?" + body, method='GET')

            if resp.status == 200:
                d = dict([el.split('=') for el in content.split('&')])
                self._access_token = d['access_token']
        return self._access_token

    def add_auth(self, code, redirect_uri):
        self.auth.append({'code': code, 'redirect_uri': redirect_uri})

    def exchange(self, code=None, redirect_uri=None):
        if code and redirect_uri != None:
            self.auth = [{'code': code, 'redirect_uri': redirect_uri}] + self.auth

        error = ''
        if len(self.auth) == 0:
            raise FlowExchangeError("Can't exchange without auth code")
        for auth in self.auth:
            body = urllib.urlencode({
                'grant_type': 'authorization_code',
                'client_id': self.client_id,
                'client_secret': self.client_secret,
                'code': auth['code'],
                'redirect_uri': auth['redirect_uri'],
                'scope': self.scope
                })
            headers = {
                'content-type': 'application/x-www-form-urlencoded',
            }
            http = httplib2.Http(timeout=0.5)

            logger.info("Exchanging code {code} for new token".format(**auth))
            try:
                resp, content = http.request(self.token_uri, method='POST', body=body,
                                             headers=headers)
                logger.info("Token exchange response: %s", content)
                if resp.status == 200:
                    d = dict([el.split('=') for el in content.split('&')])
                    access_token = d['access_token']
                    refresh_token = d.get('refresh_token', None)
                    token_expiry = None
                    if 'expires' in d:
                        token_expiry = datetime.datetime.utcnow() + datetime.timedelta(
                                                            seconds=int(d['expires']))

                    self._credentials = OAuth2Credentials(access_token, self.client_id,
                                             self.client_secret, refresh_token, token_expiry,
                                             self.token_uri, self.user_agent,
                                             id_token=d.get('id_token', None))
                    return self._credentials
                else: error = error + str(content) + "\n"
            except SSLError as e:
                logger.warn("SSLError occurred exchanging facebook code for token")
                error = error + "SSLError: " + e.message + "\n"
        else:
            raise FlowExchangeError(error)

    @property
    def credentials(self):
        if self._credentials and not self._credentials.access_token_expired and not self._credentials.invalid:
            logger.info("Using stored credentials for '%s'", self.user['name'] if self.user and self.user.has_key('name') else '')
            return self._credentials
        else:
            #if self.ready_to_exchange:
                credentials = self.exchange()
                if self.user and credentials: self.user.save_credentials(credentials)
                return self._credentials
            #else:
            #    raise oauth.

    @credentials.setter
    def credentials(self, value):
        if type(value) is not OAuth2Credentials :
            value = OAuth2Credentials.from_json(json.dumps(value))
        self._credentials = value

    @property
    def ready_to_exchange(self):
        return self.code and self.redirect_uri != None

    def request(self, api_url, query={}, credentials=None, app_access=False, method="GET"):
        if credentials: self.credentials = credentials
        if not app_access and self.credentials.access_token_expired:
            raise httplib2.HttpLib2Error('Access token expired')

        h = httplib2.Http()
        if app_access:
            request_url = api_url + "?access_token=" + self.access_token
        else:
            request_url = api_url + "?access_token=" + self.credentials.access_token

        for item in query.iteritems():
            request_url += '&' + str(item[0])+ '=' + str(item[1])

        head, content = h.request(request_url, method=method)

        if head.get('status') == '200':
            return (head, content)
        else:
            logger.error("AccessTokenCredentialsError: %s", content)
            raise AccessTokenCredentialsError(content)

    get = request

    def find(self, api_url, query={}, credentials=None, app_access=False):
        head, content = self.get(api_url, query, credentials, app_access)
        return json.loads(content)

    def post(self, api_url, query={}, credentials=None, app_access=False):
        return self.request(api_url, query, credentials, app_access, method="POST")

    def delete(self, api_url, query={}, credentials=None, app_access=False):
        return self.request(api_url, query, credentials, app_access, method="DELETE")

    def put(self, api_url, query={}, credentials=None, app_access=False):
        return self.request(api_url, query, credentials, app_access, method="PUT")

    def fql(self, f_query, credentials = None, app_access=False):
        return self.find('https://graph.facebook.com/fql' , {'q': urllib.quote(f_query)}, credentials, app_access)

    def me(self, path='', query={}, credentials = None):
        return self.find(urllib.basejoin('https://graph.facebook.com/me', str(path)), query, credentials)

    def friends(self):
        return self.fql("""SELECT name,uid FROM user WHERE is_app_user = '1' AND uid IN (SELECT uid2 FROM friend WHERE uid1 =me())""").get('data')
