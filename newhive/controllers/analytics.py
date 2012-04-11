import datetime, pandas
import newhive
from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from newhive import analytics
from newhive.utils import now
import operator as op

class AnalyticsController(ApplicationController):
    def __init__(self, *a, **b):
        super(AnalyticsController, self).__init__(*a, **b)
        self.mdb = b['db'].mdb # direct reference to pymongo db

    def active_users(self, request, response):
        analytics.user_first_month(self.db)
        if request.args.has_key('start') and request.args.has_key('end'):
            response.context['start'] = request.args.get('start')
            response.context['end'] = request.args.get('end')
            start = int(time.mktime(time.strptime(request.args.get('start'), "%Y-%m-%d")))
            end = int(time.mktime(time.strptime(request.args.get('end'), "%Y-%m-%d")))
            active_users, custom_histogram = analytics.active_users(start=start, end=end)
        else:
            event = request.args.get('event')
            if event:
                active_users, custom_histogram = analytics.active_users(event=event)
            else:
                active_users, custom_histogram = analytics.active_users(self.db)
        response.context['active_users'] = active_users
        response.context['custom_histogram'] = custom_histogram
        response.context['active_users_js'] = json.dumps(active_users)
        return self.serve_page(response, 'pages/analytics/active_users.html')

    def invites(self, request, response):
        invites = list(self.db.Referral.search({'created': {'$gt': now() - 60*60*24*30 } }))
        cache = {}

        for item in invites:
            user_name = cache.get(item['user'])
            if not user_name:
                user_name = cache[item['user']] = self.db.User.fetch(item['user'])['name']
            item['sender_name'] = user_name

        response.context['invites'] = invites
        return self.serve_page(response, 'pages/analytics/invites.html')

    def funnel1(self, request, response):
        exclude = [self.db.User.get_root().id]
        exclude = exclude + [self.db.User.named(name).id for name in config.admins]
        weekly = {}
        def invites_subr(res_dict, time0, time1):
            invites = self.mdb.referral.find({'created': {'$lt': time1, '$gt': time0}, 'user': {'$nin': exclude}})
            invites_used = filter(lambda x: x.has_key('user_created'), invites)
            res_dict[time0] = {
                'users': int((self.mdb.user.find({'created': {'$lt': time1}}).count() + self.mdb.user.find({'created': {'$lt': time0}}).count()) / 2)
                ,'invites': invites.count()
                ,'invites_used': len(invites_used)
                }
        start = date_to_epoch(2011, 11, 6)
        week = 3600*24*7
        now = time.time()
        i = 0
        while (start + i*week < now):
            invites_subr(weekly, start + i*week, start + (i+1)*week)
            i += 1
        monthly = {}
        y0 = 2011; m0 = 11;
        while (date_to_epoch(y0,m0,1) < now):
            if m0 == 12: m1 = 1; y1 = y0 + 1
            else: m1 = m0 + 1; y1 = y0
            invites_subr(monthly, date_to_epoch(y0,m0,1), date_to_epoch(y1,m1,1))
            y0 = y1; m0 = m1
        response.context['data'] = weekly
        response.context['monthly'] = monthly
        return self.serve_page(response, 'pages/analytics/funnel1.html')

    def app_count(self, request, response):
        response.context['data'] = analytics.app_count(self.db).items()
        response.context['title'] = 'App Type Count'
        return self.serve_page(response, 'pages/analytics/generic.html')

    def user_growth(self, request, response):
        users = self.db.User.search({}, sort=[('created', 1)])
        res = []
        dates = []
        counts = []
        c = 0
        for u in users:
            c = c+1
            created = u.get('created')
            dates.append(created)
            counts.append(c)
            res.append([created, c])
        response.context['data'] = res
        response.context['json_data'] = json.dumps({'dates': dates, 'counts': counts})
        response.context['title'] = 'User Growth: (' + str(len(users)) + ' users)'
        return self.serve_page(response, 'pages/analytics/user_growth.html')

    def last_login(self, request, response):
        act_log = self.db.ActionLog.search({})
        res = {}
        for a in act_log:
            user = a['user']
            if res.has_key(user):
                if res[user] < a['created']: res[user] = a['created']
            else:
                res[user] = a['created']
        now = time.time()
        days_ago = range(1,67)
        timeslice = []
        for i, day_ago in enumerate(days_ago):
            time0 = now if i==0 else now - 3600*24*days_ago[i-1]
            time1 = now - 3600*24*day_ago
            timeslice.append(len(filter(lambda x: x[1] < time0 and x[1] > time1, res.iteritems())))
        response.context['days_ago'] = days_ago
        response.context['timeslice'] = timeslice
        response.context['data'] = json.dumps({'days_ago': days_ago, 'timeslice': timeslice})
        return self.serve_page(response, 'pages/analytics/last_login.html')

    def funnel2(self, request, response):
        import pandas
        weekly_range = pandas.DateRange(datetime(2011,11,6), end = datetime.now(), offset=pandas.DateOffset(days=7))
        monthly_range = pandas.DateRange(datetime(2011,11,1), end = datetime.now(), offset=pandas.DateOffset(months=1))

        def subroutine(res_dict, time0, time1):
            res_dict[time.mktime(time0.timetuple())] = analytics.funnel2(self.db.mdb, time0, time1)

        weekly_data = {}
        for date in weekly_range:
            subroutine(weekly_data, date, date + pandas.DateOffset(days=7))

        monthly_data = {}
        for date in monthly_range:
            subroutine(monthly_data, date, date + pandas.DateOffset(months=1))

        response.context['data'] = weekly_data
        response.context['monthly'] = monthly_data

        return self.serve_page(response, 'pages/analytics/funnel2.html')

    def signups_per_hour(self, request, response):
        response.context['data'] = json.dumps(analytics.contacts_per_hour(self.db.mdb))
        return self.serve_page(response, 'pages/analytics/signups_per_hour.html')
     #else:
    #    return serve_404(self, request, response)

    def by_stars(self, request, response, args={}):
        exprs = {}
        for r in self.db.Feed.search({'class_name':'Star', 'entity_class':'Expr'}):
            exprs[r['entity']] = exprs.get(r['entity'], []) + [r['initiator_name']]
        expr_list = []
        for i in exprs: expr_list.append({ 'id':i, 'star_count':len(exprs[i]), 'starred_by':exprs[i] })
        expr_list.sort(key=op.itemgetter('star_count'), reverse=True)
        data = []
        for i in expr_list[0:200]:
            e = self.db.Expr.fetch(i['id'])
            if e:
                dict.update(e, i)
                data.append(e)
        response.context['data'] = data

        return self.serve_page(response, 'pages/analytics/by_stars.html')

    def cohort(self, request, response):
        cohort_users = analytics._cohort_users(self.db)
        cohort_map = {
                "active_users": {
                    "title": "Active Users (visted 2+ visits in month) by cohort"
                    , "data": analytics.visits_per_month
                    }
                , "expression_creates": {
                    "title": 'Fraction of users who created an expression in the month, by cohort'
                    , "data": analytics.expressions_per_month
                    }
                , "referrals": {
                    "title": 'Fraction of users who invited another user in the month (not necessarily used), by cohort'
                    , "data": analytics.referrals_per_month
                    }
                , "used_referrals": {
                    "title": 'Fraction of users who invited another user and that person joined, by cohort'
                    , "data": analytics.used_referrals_per_month
                    }
                , "funnel2": {
                    "title": 'Funnel 2: Fraction of users who had a user signup on one of their expressions (not neccessarily created account), by cohort'
                    , "data": analytics.funnel2_per_month
                    }
                }

        metric = cohort_map[lget(request.path.split("/"), 2)]
        p4 = lget(request.path.split("/"), 3)
        if request.args.get("force") == "true":
            force = {1: True}
        else:
            force = {}
        response.context['data'] = metric['data'](self.db, cohort_users, force=force)
        response.context['title'] = metric['title']
        data_frame = pandas.DataFrame(response.context['data'])
        response.context['json'] = json.dumps(
                data_frame.applymap(lambda x: x['active_fraction'] if x else None).values.tolist())
        response.context['meta'] = json.dumps({
                'cohorts': map(newhive.utils.time_s, data_frame.axes[1].tolist())
                , 'dates': map(newhive.utils.time_s, data_frame.axes[0].tolist())
                , 'cohort_sizes': cohort_users.counts.values.tolist()
                })
        if p4 == 'chart':
            return self.serve_page(response, 'pages/analytics/cohort_chart.html')
        return self.serve_page(response, 'pages/analytics/cohort_base.html')

    def cohort_dashboard(self, request, response):
        url_parts = request.path.split('/')
        print url_parts
        year = int(lget(url_parts, 2, 0))
        month = int(lget(url_parts, 3, 0))
        if not year or not month:
            date = datetime.now() - pandas.DateOffset(months=1)
            year = date.year
            month = date.month
        date = datetime(year, month, 1, 12)
        cohort_users = analytics._cohort_users(self.db, date)
        response.context['date'] = date
        response.context['cohorts'] = cohort_users['names']
        response.context['metrics'] = [
                {'name': 'Visited 2+ days'
                    , 'data': analytics.visits_per_month(self.db, cohort_users, year, month)
                    , 'url': '/analytics/active_users_cohort'}
                , {'name': 'Created an expression'
                    , 'data': analytics.expressions_per_month(self.db, cohort_users, year, month)
                    , 'url': '/analytics/expression_creates_cohort'}
                , {'name': 'Invited a friend'
                    , 'data': analytics.referrals_per_month(self.db, cohort_users, year, month)
                    , 'url': '/analytics/referrals_cohort'}
                , {'name': 'Had an invite convert'
                    , 'data': analytics.used_referrals_per_month(self.db, cohort_users, year, month)
                    , 'url': '/analytics/used_referrals_cohort'}
                , {'name': "Signup on user's expression (funnel 2)"
                    , 'data': analytics.funnel2_per_month(self.db, cohort_users, year, month)
                    , 'url': '/analytics/funnel2_cohort'}
                ]
        return self.serve_page(response, 'pages/analytics/cohort_dashboard.html')
