import httplib2, os

from apiclient.discovery import build
from oauth2client.file import Storage
from oauth2client.client import OAuth2WebServerFlow
from oauth2client import tools

from newhive import config

filters = {
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
