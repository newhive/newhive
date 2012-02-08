import httplib2, os, urllib, datetime

from apiclient.discovery import build
from oauth2client.file import Storage
from oauth2client.client import OAuth2WebServerFlow, OAuth2Credentials
from oauth2client import tools

from newhive import config

ga_filters = {
        'expressions': 'ga:hostname!=thenewhive.com;' + ";".join(['ga:pagePath!~' + path for path in ['^/expressions', '^/feed', '^/listening', '^/starred']])
        }

class GAClient(object):

    def __init__(self):
        self.id = 'ga:45783306'
        self.storage = Storage(os.path.join(config.src_home, 'newhive', 'config', 'GA_credentials.dat'))
        self.credentials = self.storage.get()

        if self.credentials is None or self.credentials.invalid == True:
            print self.credentials
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

    def __init__(self):
        self.client_id = '153421698080835'
        self.client_secret = '53168c0305074b8ff82cab217d5043f9'
        self.scope = 'email,publish_stream'
        self.auth_uri = 'https://www.facebook.com/dialog/oauth'
        self.token_uri = 'https://graph.facebook.com/oauth/access_token'
        self.user_agent = None

        self.flow = OAuth2WebServerFlow(
                client_id=self.client_id
                , client_secret=self.client_secret
                , scope=self.scope
                , auth_uri = self.auth_uri
                , token_uri = self.token_uri
                )

    def authorize_url(self, redirect_url):
        return self.flow.step1_get_authorize_url(redirect_url)

    def exchange(self, request):
        code = request.args.get('code')
        self.redirect_uri = request.base_url
        body = urllib.urlencode({
            'grant_type': 'authorization_code',
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'code': code,
            'redirect_uri': self.redirect_uri,
            'scope': self.scope,
            })
        headers = {
            'content-type': 'application/x-www-form-urlencoded',
        }
        http = httplib2.Http()

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

           return OAuth2Credentials(access_token, self.client_id,
                                    self.client_secret, refresh_token, token_expiry,
                                    self.token_uri, self.user_agent,
                                    id_token=d.get('id_token', None))

