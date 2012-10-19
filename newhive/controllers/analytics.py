import datetime, pandas
import newhive
import newhive.ab
from newhive.controllers.shared import *
from newhive.controllers import Application
from newhive.analytics import analytics, queries
from newhive.utils import now, datetime_to_int
import operator as op

_index = []

def data_frame_to_json(df):
    output = {name: series.tolist() for name, series in df.iterkv()}
    if hasattr(df.index[0], 'timetuple'):
        index = [datetime_to_int(date) for date in df.index]
    elif type(df.index[0]) == pandas.np.int64:
        index = map(int, df.index)
    else:
        index = map(str, df.index)
    output['index'] = index
    return output

class Analytics(Application):
    def __init__(self, *a, **b):
        super(Analytics, self).__init__(*a, **b)
        self.mdb = b['db'].mdb # direct reference to pymongo db

    @admins
    def _index(self, request, response):
        response.context['pages'] = [{'path': p.__name__, 'name': p.__doc__} for p in _index]
        return self.serve_page(response, 'pages/analytics/index.html')

    def index(method):
        _index.append(method)
        return method

    def _iso_args(self, args):
        start = args.get('start')
        if start: start = int(time.mktime(time.strptime(start, "%Y-%m-%d")))
        end = args.get('end')
        if end: end = int(time.mktime(time.strptime(end, "%Y-%m-%d")))
        return (start, end)

    @index
    def active_users(self, request, response):
        """Users active in action log"""
        analytics.user_first_month(self.db)
        if request.args.has_key('start') and request.args.has_key('end'):
            response.context['start'] = request.args.get('start')
            response.context['end'] = request.args.get('end')
            start, end = self._iso_args(request.args)
            #start = int(time.mktime(time.strptime(request.args.get('start'), "%Y-%m-%d")))
            #end = int(time.mktime(time.strptime(request.args.get('end'), "%Y-%m-%d")))
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

    @index
    def invites(self, request, response):
        """Invites log"""
        invites = list(self.db.Referral.search({'created': {'$gt': now() - 60*60*24*30 } }))
        cache = {}

        for item in invites:
            user_name = cache.get(item['user'])
            if not user_name:
                user_name = cache[item['user']] = self.db.User.fetch(item['user'])['name']
            item['sender_name'] = user_name

        response.context['invites'] = invites
        return self.serve_page(response, 'pages/analytics/invites.html')

    @index
    def funnel1(self, request, response):
        """Funnel 1"""
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

    @index
    def app_count(self, request, response):
        """Total apps in expressions by type"""
        response.context['data'] = analytics.app_count(self.db).items()
        response.context['title'] = 'App Type Count'
        return self.serve_page(response, 'pages/analytics/generic.html')

    @index
    def active_user_growth(self, request, response):
        """Active user count over time"""
        period = int(lget(request.path.split('/'), 2, 7))
        data, daterange = analytics.active(self.db, period)
        dates = [datetime_to_int(date) for date in daterange]
        response.context['json_data'] = json.dumps({'counts': data, 'dates': dates})
        response.context['title'] = 'Active User Growth'
        return self.serve_page(response, 'pages/analytics/user_growth.html')


    @index
    def user_growth(self, request, response):
        """Total user account count over time"""
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

    @index
    def last_login(self, request, response):
        """Users by time since last login"""
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

    @index
    def funnel2(self, request, response):
        """Funnel 2"""
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

    @index
    def signups(self, request, response):
        """Signups and accounts created over last time period (configurable)"""
        period = request.args.get('period', 'hour')
        kwargs = {}
        kwargs['period'] = period + 's'
        kwargs['start'], kwargs['end'] = self._iso_args(request.args)
        response.context['data'] = json.dumps(analytics.signups(self.db.mdb, **kwargs))
        response.context['title'] = 'Signups per ' + period
        return self.serve_page(response, 'pages/analytics/active_total_chart.html')

    @index
    def by_stars(self, request, response, args={}):
        """Top Expressions by Love Count"""
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
        """Cohort analysis"""
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
                , "impressions": {
                    "title": "Views on users' expressions"
                    , "data": analytics.impressions_per_user
                    }
                }

        try:
            metric = cohort_map[lget(request.path.split("/"), 2)]
        except KeyError:
            return self.serve_404(request, response)
        p4 = lget(request.path.split("/"), 3)
        if request.args.get("force") == "true":
            force = True
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

    @index
    def cohort_dashboard(self, request, response):
        """Cohort dashboard"""
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
                    , 'url': '/analytics/cohort/active_users'}
                , {'name': 'Created an expression'
                    , 'data': analytics.expressions_per_month(self.db, cohort_users, year, month)
                    , 'url': '/analytics/cohort/expression_creates'}
                , {'name': 'Invited a friend'
                    , 'data': analytics.referrals_per_month(self.db, cohort_users, year, month)
                    , 'url': '/analytics/cohort/referrals'}
                , {'name': 'Had an invite convert'
                    , 'data': analytics.used_referrals_per_month(self.db, cohort_users, year, month)
                    , 'url': '/analytics/cohort/used_referrals'}
                , {'name': "Signup on user's expression (funnel 2)"
                    , 'data': analytics.funnel2_per_month(self.db, cohort_users, year, month)
                    , 'url': '/analytics/cohort/funnel2'}
                ]
        return self.serve_page(response, 'pages/analytics/cohort_dashboard.html')

    @admins
    @index
    def impressions_per_user(self, request, response):
        """Users grouped by total expression impressions"""
        url_parts = request.path.split('/')
        view = lget(url_parts, 2, 'chart')
        if view == 'top':
            # collection is a mongodb collection
            collection = analytics.overall_impressions(self.db, histogram=False)
            user_list = collection.find({}, sort=[('value.views', -1)], limit=100)
            users = []
            for item in user_list:
                user = self.db.User.fetch(item['_id'])
                user.impressions = item['value']['views']
                users.append(user)
            response.context['users'] = users
            return self.serve_page(response, 'pages/analytics/impressions_top.html')

        elif view == 'chart':
            hist, bin_edges = analytics.overall_impressions(self.db)
            response.context['data'] = list(hist[1:15])
            response.context['edges'] = list(bin_edges[1:16])
            return self.serve_page(response, 'pages/analytics/impressions.html')

    @index
    def pageviews(self, request, response):
        """Pageviews"""
        end = datetime.now()
        start = datetime(2012,1,1)
        c = response.context
        c['dates'], c['data'] = analytics.pageviews(self.db, start, end)
        return self.serve_page(response, 'partials/charts/time.html')

    def js_error_log(self, request, response):
        args = request.args
        log_entry = {
                'type': 'javascript'
                , 'environ': newhive.utils.serializable_filter(request.environ)
                , 'exception': args.get('err')
                , 'stack_frames': [{
                    'filename': args.get('fl'),
                    'lineno': args.get('ln')
                    }]
                , 'url': args.get('sn')
                , 'code_revision': newhive.manage.git.current_revision
                , 'dev_prefix': config.dev_prefix
                }

        request = request.environ.get('hive.request')
        if request and hasattr(request, 'requester'):
            log_entry.update({'requester': {'id': request.requester.id
                                            , 'name': request.requester.get('name')}})

        self.db.ErrorLog.create(log_entry)

        response_data = "jsErrLog.removeScript(" + request.args.get('i') + ");"
        return self.serve_data(response, mime='application/javascript', data=response_data)

    @admins
    @index
    def engagement_pyramid(self, request, response):
        """Engagement pyramid"""
        data = analytics.engagement_pyramid(self.db)
        out = data[['viewers', 'starrers', 'sharers', 'creators']] / data.counts
        response.context['data'] = out
        return self.serve_page(response, 'pages/analytics/engagement_pyramid.html')

    @admins
    @index
    def email_log(self, request, response):
        """Email log"""
        start, end = self._iso_args(request.args)
        spec = dfilter(request.args, ['category', 'initiator_name', 'recipient_name', 'email'])
        response.context['data'] = self.db.MailLog.search(spec, sort=[('created', -1)], limit=500)
        return self.serve_page(response, 'pages/analytics/email_log.html')

    @admins
    @index
    def ab_test(self, request, response):
        """AB test results"""
        tests = {
                'sig': newhive.ab.AB_SIG(self.db)
                , 'reminder_email': newhive.ab.AB_ReferralReminder(self.db)
                }
        page = lget(request.path.split('/'), 2)
        if page:
            test = tests.get(page)
            if not test: return self.serve_404(request, response)
            response.context['data'] = test.data()
            response.context['title'] = test.name
            return self.serve_page(response, 'pages/analytics/ab_test.html')
        else:
            response.context['tests'] = tests
            return self.serve_page(response, 'pages/analytics/ab_tests.html')

    @admins
    def ga_segments(self, request, response):
        ga = newhive.oauth.GAClient()
        segments = ga.management.segments().list().execute()['items']
        return self.serve_json(response, segments)

    @admins
    @index
    def retention(self, request, response):
        """User Retention D1-D30 or W1-W30"""
        freq = request.args.get('freq', 'D')
        response.context['title'] = "{}1-{}30 Retention".format(freq, freq)
        if freq == 'M': freq = 'MS'
        data = analytics.retention(self.db, freq)
        response.context['data'] = data_frame_to_json(data)
        return self.serve_page(response, 'pages/analytics/active_total_chart.html')

    @admins
    @index
    def user_median_views(self, request, response):
        """Median Views by User"""
        data = queries.UserMedianViews(self.db).execute()
        data = data.sort('median_views', ascending=False)
        response.context['data'] = data_frame_to_json(data)
        response.context['title'] = """Median Views by User"""
        return self.serve_page(response, 'pages/analytics/median_views.html')
