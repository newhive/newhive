import os, re, json, time, mimetypes, math
from datetime import datetime
from newhive import config, colors, auth
import newhive.ui_strings.en as ui
from newhive.utils import *
import urllib


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

def large_number(number):
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

    def expr_featured(self, request, response, args=None):
        kwargs = query_args(request)
        if args: kwargs.update(args)
        if (request.path_parts, 1): response.context['title'] = 'Featured Expressions'
        return self.db.Expr.page(self.db.User.root_user['tagged']['Featured'], **kwargs), {'tag': 'Featured'}

    def expr_all(self, request, response):
        response.context['title'] = 'All Expressions'
        return self.db.Expr.page({'auth': 'public'}, **query_args(request)), {'tag': 'Recent'}
    def home_feed(self, request, response):
        if (request.path_parts, 1): response.context['title'] = 'Network'
        return request.requester.feed_network(**query_args(request))
    def people(self, request, response):
        response.context['title'] = 'People'
        return self.db.User.page({}, **query_args(request))
    def expr_page(self, request, response):
        page = lget(request.path_parts, 2, 'about')
        response.context['title'] = page
        return expr_to_html( self.db.Expr.named( config.site_user, lget(request.path_parts, 2, 'about') ) )
    def user_exprs(self, request, response, auth=None):
        return request.owner.expr_page(auth=auth, tag=request.args.get('tag'), **query_args(request)), {'user': request.owner['name']}
    def feed_network(self, request, response):
        return request.owner.feed_network(**query_args(request))
    def feed_profile(self, request, response, by_owner=False, spec={}, **args):
        args.update(query_args(request))
        if by_owner: spec.update({'initiator': request.owner.id})
        return request.owner.feed_profile_entities(spec=spec, **args)
    def listening(self, request, response):
        return request.owner.starred_user_page(**query_args(request))
    def listeners(self, request, response):
        return request.owner.starrer_page(**query_args(request))
