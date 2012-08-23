import os, re, json, time, mimetypes, math
from datetime import datetime
from newhive import config, colors, auth
import newhive.ui_strings.en as ui
from newhive.utils import *
import urllib

def admins(server):
    def access_controlled(self, request, response, *arg, **kwarg):
        if not request.requester.is_admin:
            return self.serve_404(request, response, *arg, **kwarg)
        elif not request.is_secure:
            return self.redirect(
                    response, abs_url(secure=True) + request.path + '?' + request.query_string)
        else:
            return server(self, request, response, *arg, **kwarg)
    return access_controlled

def date_to_epoch(*args): return int(time.mktime(datetime(*args).timetuple()))

def epoch_to_string(epoch_time):
    return time.strftime("%a, %d %b %Y %H:%M:%S +0000", time.localtime(epoch_time))

def querystring(args):
    if not args: return ''
    parms = []
    for a in args: parms.append((a, args[a]))
    return '?' + urllib.urlencode(parms)

def friendly_date(then):
    """Accepts datetime.datetime, returns string such as 'May 23' or '1 day ago'. """
    if type(then) in [int, float]:
      then = time_u(then)

    now = datetime.utcnow()
    dt = now - then
    if dt.seconds < 60:
        return "just now"
    months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    s = months[then.month] + ' ' + str(then.day)
    if then.year != now.year: s += ' ' + str(then.year)
    if dt.days < 7:
        if not dt.days:
            if dt.seconds < 3600: (t, u) = (dt.seconds / 60, 'min')
            else: (t, u) = (dt.seconds / 3600, 'hr')
        else: (t, u) = (dt.days, 'day')
        s = str(t) + ' ' + u + ('s' if t > 1 else '') + ' ago'
    return s

def no_zero(num):
    return '' if num == 0 else num

def large_number(number):
    if type(number) != int: return number
    if number < 10000: return str(number)
    elif 10000 <= number < 1000000:
        return str(int(number/1000)) + "K"
    elif 1000000 <= number < 10000000:
        return str(math.floor(number/100000)/10) + "M"
    elif 10000000 <= number:
        return str(int(number/1000000)) + "M"

def length_bucket(t):
    l = len(t)
    if l < 10: return 1
    if l < 20: return 2
    return 3

def query_args(request):
    return {'page': request.args.get('page'), 'viewer': request.requester}

class PagingMixin(object):

    def paging_decorator(func):
        def wrapped(self, request, response, args=None, **kwargs):
            paging_args = query_args(request)
            if args: paging_args.update(args)
            return func(self, request, response, paging_args, **kwargs)
        return wrapped

    @paging_decorator
    def expr_featured(self, request, response, paging_args, **kwargs):
        if (request.path_parts, 1): response.context['title'] = 'Featured Expressions'
        return self.db.Expr.page(self.db.User.root_user['tagged']['Featured'], **paging_args), {'tag': 'Featured'}

    @paging_decorator
    def expr_all(self, request, response, paging_args, **kwargs):
        response.context['title'] = 'All Expressions'
        #quality_filter = [{'views': {'$gt': 25}}, {'analytics.Star': {'$gt': 0}}]
        return self.db.Expr.page({'auth': 'public'}, **paging_args), {'tag': 'All'}

    @paging_decorator
    def home_feed(self, request, response, paging_args, **kwargs):
        if (request.path_parts, 1): response.context['title'] = 'Network'
        return request.requester.feed_network(**paging_args), {'tag': 'Network'}

    @paging_decorator
    def people(self, request, response, paging_args, **kwargs):
        response.context['title'] = 'People'
        return self.db.User.page({}, **paging_args)

    @paging_decorator
    def user_exprs(self, request, response, paging_args, auth=None, **kwargs):
        args = {'user': request.owner['name']}
        if auth: args['auth'] = auth.replace('password', 'private')
        return request.owner.expr_page(auth=auth, tag=request.args.get('tag'), **paging_args), args

    @paging_decorator
    def feed_network(self, request, response, paging_args, **kwargs):
        return request.owner.feed_network(**paging_args)

    def feed_profile(self, request, response, by_owner=False, spec={}, **args):
        args.update(query_args(request))
        if by_owner: spec.update({'initiator': request.owner.id})
        return request.owner.feed_profile_entities(spec=spec, **args)

    @paging_decorator
    def listening(self, request, response, paging_args, **kwargs):
        return request.owner.starred_user_page(**paging_args)

    @paging_decorator
    def listeners(self, request, response, paging_args, **kwargs):
        return request.owner.starrer_page(**paging_args)
