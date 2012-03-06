import httplib2, os, urllib, datetime, json

from apiclient.discovery import build
from oauth2client.file import Storage
from oauth2client.client import OAuth2WebServerFlow, OAuth2Credentials, FlowExchangeError, AccessTokenCredentialsError
from oauth2client import tools

from newhive import config
from newhive.utils import abs_url

ga_filters = {
        'expressions': 'ga:hostname!=thenewhive.com;' + ";".join(['ga:pagePath!~' + path for path in ['^/expressions', '^/feed', '^/listening', '^/starred']])
        }

class GAClient(object):

    def __init__(self):
        self.id = 'ga:45783306'
        self.storage = Storage(os.path.join(config.src_home, 'newhive', 'config', 'GA_credentials.dat'))
        self.credentials = self.storage.get()

        if self.credentials is None or self.credentials.invalid == True:
            flow = OAuth2WebServerFlow(
                client_id='350420752663-ou6fksfmbv8cpf22ou6t5aebduc661km.apps.googleusercontent.com',
                client_secret='sD5aL7o27yZAj-O7Ik08cKWO',
                scope='https://www.googleapis.com/auth/analytics.readonly',
                user_agent='moderator-cmdline-sample/1.0')

            tools.FLAGS.auth_local_webserver = False
            self.credentials = tools.run(flow, self.storage)

        http = httplib2.Http()
        http = self.credentials.authorize(http)
        self.client = build("analytics", "v3", http=http)

    @property
    def managment(self): return self.client.management()

    @property
    def data(self): return self.client.data()

    def find_one(self, query):
        query.update({'ids': self.id})
        return self.data.ga().get(**query).execute().get('totalsForAllResults')

class FacebookClient(object):

    def __init__(self, code=None, redirect_uri=None, user=None):
        self.client_id = config.facebook_app_id
        self.client_secret = config.facebook_client_secret
        self.scope = 'email,publish_actions'
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
        return self.flow.step1_get_authorize_url(redirect_url)

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
            http = httplib2.Http(timeout=1)

            resp, content = http.request(self.token_uri, method='POST', body=body,
                                         headers=headers)
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
        else:
            print error
            raise FlowExchangeError(error)

    @property
    def credentials(self):
        if self._credentials and not self._credentials.access_token_expired:
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
            print "Facebook Error: " + str(content)
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
        if not self.credentials: raise Exception('Facebook credentials invalid')
        return self.fql("""SELECT name,uid FROM user WHERE is_app_user = '1' AND uid IN (SELECT uid2 FROM friend WHERE uid1 =me())""").get('data')
