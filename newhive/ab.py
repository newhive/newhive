import datetime, copy
import pandas
from newhive.oauth import GAQuery

class AB_Test(object):
    def __init__(self, db):
        self.db = db

class AB_SIG(AB_Test):
    name = "Signup Page AB test"
    segments = ["AB_SIG old", "AB_SIG new"]

    def data(self):
        queries = {}
        queries['events'] = GAQuery(filters=['ga:eventCategory==create_account']
                        , metrics=['ga:uniqueEvents']
                        , start_date='2012-10-08'
                        , end_date='2012-10-15'
                        )
        queries['views'] = copy.copy(queries['events'])
        queries['views'].filters(['ga:pagePath=~^/create_account']).metrics(['ga:uniquePageviews'])

        df = pandas.DataFrame(
            {key: [query.segment(seg).execute().total for seg in self.segments] for key, query in queries.iteritems()}
            , index=self.segments)

        ratio = df.events / df.views
        ratio.name = 'ratio'
        return df.join(ratio)

class AB_ReferralReminder(AB_Test):
    name = "Copy changes on site referral reminder"
    versions = ["A", "B", "C"]

    def data(self):
        versions = ["A", "B", "C"]
        data = pandas.DataFrame(index=versions)
        cursors = [self.db.MailLog.search({'category': 'site_referral_reminder', 'unique_args.version': version}) for version in versions]
        data['total'] = [c.count() for c in cursors]
        converted = []
        for cursor in cursors:
            referral_ids = [mail_log['unique_args']['referral_id'] for mail_log in cursor]
            referrals = self.db.Referral.search({'_id':{'$in': referral_ids}, 'user_created': {'$exists': True}})
            converted.append(referrals.count())
        data['converted'] = converted
        data['ratio'] = data['converted'].apply(float) / data['total']
        return data
