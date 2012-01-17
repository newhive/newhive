from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from newhive import analytics

class AnalyticsController(ApplicationController):

    def active_users(self, request, response):
        analytics.user_first_month()
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
                active_users, custom_histogram = analytics.active_users()
        response.context['active_users'] = active_users
        response.context['custom_histogram'] = custom_histogram
        response.context['active_users_js'] = json.dumps(active_users)
        return self.serve_page(response, 'pages/analytics/active_users.html')

    def invites(self, request, response):
        invites = self.db.Referral.search()
        cache = {}
        for item in invites:
            user_name = cache.get(item['user'])
            if not user_name:
                user_name = cache[item['user']] = self.db.User.fetch(item['user'])['name']
            item['sender_name'] = user_name

        response.context['invites'] = invites
        return self.serve_page(response, 'pages/analytics/invites.html')

    def funnel1(self, request, response):
        exclude = [get_root().id]
        exclude = exclude + [self.db.User.named(name).id for name in config.admins]
        weekly = {}
        def invites_subr(res_dict, time0, time1):
            invites = db.referral.find({'created': {'$lt': time1, '$gt': time0}, 'user': {'$nin': exclude}})
            invites_used = filter(lambda x: x.has_key('user_created'), invites)
            res_dict[time0] = {
                'users': int((db.user.find({'created': {'$lt': time1}}).count() + db.user.find({'created': {'$lt': time0}}).count()) / 2)
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
        response.context['data'] = analytics.app_count().items()
        response.context['title'] = 'App Type Count'
        return self.serve_page(response, 'pages/analytics/generic.html')

    def user_growth(self, request, response):
        users = self.db.User.search()
        users.sort(lambda a,b: cmp(a.get('created'), b.get('created')))
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
        act_log = self.db.ActionLog.search()
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

    #else:
    #    return serve_404(self, request, response)


