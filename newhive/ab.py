import datetime, copy
import pandas
from newhive.oauth import GAQuery

class AB_Test(object):
    pass

class AB_SIG(AB_Test):
    name = "Signup Page AB test"
    segments = ["AB_SIG old", "AB_SIG new"]

    def data(self):
        queries = {}
        queries['events'] = GAQuery(filters=['ga:eventCategory==create_account']
                        , metrics=['ga:uniqueEvents']
                        , start_date='2012-10-08'
                        , end_date=datetime.datetime.now()
                        )
        queries['views'] = copy.copy(queries['events'])
        queries['views'].filters(['ga:pagePath=~^/create_account']).metrics(['ga:uniquePageviews'])

        df = pandas.DataFrame(
            {key: [query.segment(seg).execute().total for seg in self.segments] for key, query in queries.iteritems()}
            , index=self.segments)

        ratio = df.events / df.views
        ratio.name = 'ratio'
        return df.join(ratio)
