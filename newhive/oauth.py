import httplib2, os, urllib, datetime, json, re, copy

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


    @property
    def http(self):
        http = httplib2.Http()
        http = self.credentials.authorize(http)
        return http

    @property
    def client(self):
        return build("analytics", "v3", http=self.http)

    @property
    def management(self): return self.client.management()

    @property
    def data(self): return self.client.data()

    def query(self, query, execute=True):
        query.update({'ids': self.id})
        ga_query = self.data.ga().get(**query)
        if execute: return ga_query.execute()
        else: return ga_query

    def find(self, query):
        return self.query(query).get('rows')

    def find_one(self, query):
        return self.query(query).get('totalsForAllResults')

    def find_time_series(self, query):
        if not query.has_key('dimensions'): query['dimensions'] = 'ga:date'
        results = self.find(query)
        return [[datetime.datetime.strptime(date, '%Y%m%d'), float(value)] for date, value in results]

    def find_segment_id(self, name):
        if not hasattr(self, 'segments'):
            self.segments = self.management.segments().list().execute()['items']
        try:
            segments = filter(lambda x: x['name'].startswith(name), self.segments)
            if len(segments) > 1:
                logger.warn("more than one GA segment matches '{}'".format(name))
            return segments[0]['segmentId']
        except IndexError as e:
            raise KeyError("segment '{}' not found in google analytics".format(name))

class GAQuery(object):

    def __init__(self, start_date=None, end_date=None, dimensions=None, metrics=None, filters=None, segment=None):
        self._query = {}
        self.client = GAClient()
        for arg in ['start_date', 'end_date', 'dimensions', 'metrics', 'filters', 'segment']:
            val = eval(arg)
            if val: getattr(self, arg)(val)

    def __copy__(self):
        new_copy = GAQuery()
        new_copy._query = copy.copy(self._query)
        return new_copy

    def _ga_date(self, date):
        if hasattr(date, 'strftime'):
            return date.strftime("%Y-%m-%d")
        elif re.match('^\d{4}-\d{2}-\d{2}$', date):
            return date
        else:
            raise ValueError

    def start_date(self, date):
        self._query.update(start_date=self._ga_date(date))
        return self

    def end_date(self, date):
        self._query.update(end_date=self._ga_date(date))
        return self

    def dimensions(self, dimensions):
        self._query.update(dimensions=';'.join(dimensions))
        return self

    def metrics(self, metrics):
        self._query.update(metrics=';'.join(metrics))
        return self

    def filters(self, filters):
        self._query.update(filters=';'.join(filters))
        return self

    def segment(self, segment=None, unset=False):
        if unset:
            self._query.pop('segment', None)
        if segment == None:
            return self._query.get('segment')

        # if segment in argument is not in the form of a GA id, find it by name
        if re.match('^gaid::', segment): new_segment = segment
        else: new_segment = self.client.find_segment_id(segment)

        self._query.update(segment=new_segment)
        return self

    def query(self):
        return self.client.query(self._query, execute=False)

    def execute(self):
        return QueryResponse(self.client.query(self._query))

    def find_one(self):
        return self.client.find_one(self.query)

    def cohort(self, series, reduce_function=lambda x: x):
        # save segment for restoring later
        segment = self.segment()

        batch = BatchHttpRequest()

        def callback_builder(res, date):
            def callback(id, result, error):
                res[date] = reduce_function(result)
            return callback

        for date in series.keys():
            cohort_name = date.strftime("%Y-%m Cohort")
            try:
                self.segment(cohort_name)
                batch.add(self.query(), callback_builder(series, date))
            except KeyError:
                pass
        self.segment(segment)

        batch.execute(http=self.client.http)

class QueryResponse(dict):

    def __getattr__(self, name):
        if name in ['rows', 'query', 'columnHeader']:
            return self[name]

    @property
    def total(self):
        return float(self['totalsForAllResults'].values()[0])

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
            http = httplib2.Http(timeout=0.2)

            logger.info("Exchanging code for new token")
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
