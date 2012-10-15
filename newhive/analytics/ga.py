import os, httplib2, datetime, re, copy
import apiclient
from apiclient.http import BatchHttpRequest
import oauth2client
from oauth2client.file import Storage
from oauth2client.client import OAuth2WebServerFlow, OAuth2Credentials, FlowExchangeError, AccessTokenCredentialsError
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
            flow = OAuth2WebServerFlow(
                client_id='350420752663-ou6fksfmbv8cpf22ou6t5aebduc661km.apps.googleusercontent.com',
                client_secret='sD5aL7o27yZAj-O7Ik08cKWO',
                scope='https://www.googleapis.com/auth/analytics.readonly',
                user_agent='moderator-cmdline-sample/1.0')

            oauth2client.tools.FLAGS.auth_local_webserver = False
            self.credentials = oauth2client.tools.run(flow, self.storage)


    @property
    def http(self):
        http = httplib2.Http()
        http = self.credentials.authorize(http)
        return http

    @property
    def client(self):
        return apiclient.discovery.build("analytics", "v3", http=self.http)

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


