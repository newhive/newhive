import os, re, json, time, mimetypes, math
from functools import partial
from datetime import datetime
from newhive import config, colors, auth, state
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

def admins_insecure(server):
    def access_controlled(self, request, response, *arg, **kwarg):
        if not request.requester.is_admin:
            return self.serve_404(request, response, *arg, **kwarg)
        else:
            return server(self, request, response, *arg, **kwarg)
    return access_controlled

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
    if number < 10000: return '{:,}'.format(number)
    elif 10000 <= number < 1000000:
        return str(int(number/1000)) + "K"
    elif 1000000 <= number < 10000000:
        return str(math.floor(number/100000)/10) + "M"
    elif 10000000 <= number:
        return "{:,}".format(int(number/1000000)) + "M"

def length_bucket(t):
    l = len(t)
    if l < 10: return 1
    if l < 20: return 2
    return 3

def query_args(request):
    args = request.args.copy().to_dict(flat=True)
    args = dfilter(args, ['sort', 'page', 'expr', 'order', 'limit'])
    args['viewer'] = request.requester
    if args.has_key('order'): args['order'] = int(args['order'])
    if args.has_key('limit'): args['limit'] = min( 100, int(args['limit']) )
    return args

def link_args(response, args): response.context.update( args = args )

class PagingMixin(object):

    def set_next_page(self, request, response, items):
        page = items.next
        next_page = ( querystring({ 'partial': 't', 'page': page, 'q': request.args.get('q') })
            if page else None )
        response.context.update( next_page = next_page )

    def paging_decorator(func):
        def wrapped(self, request, response, args=None, **kwargs):
            paging_args = query_args(request)
            if args: paging_args.update(args)
            cards = func(self, request, response, paging_args, **kwargs)
            self.set_next_page( request, response, cards )
            viewer = paging_args.get('viewer')
            response.context.update( cards = map(
                lambda o: self.item_prepare( o, viewer = viewer ), cards ) )
        return wrapped

    @paging_decorator
    def expr_featured(self, request, response, paging_args, **kwargs):
        if (request.path_parts, 1): response.context['title'] = 'Featured Expressions'
        link_args(response, {'q': '#Featured'})
        return self.db.Expr.page(self.db.User.root_user['tagged']['Featured'], **paging_args)

    @paging_decorator
    def expr_all(self, request, response, paging_args, **kwargs):
        response.context['title'] = 'All Expressions'
        #quality_filter = [{'views': {'$gt': 25}}, {'analytics.Star': {'$gt': 0}}]
        link_args(response, {'q': '#All'})
        return self.db.Expr.page({'auth': 'public'}, **paging_args)

    @paging_decorator
    def home_feed(self, request, response, paging_args, **kwargs):
        if (request.path_parts, 1): response.context['title'] = 'Network'
        link_args(response, {'q': '#Network'})
        return request.requester.feed_network(**paging_args)

    @paging_decorator
    def people(self, request, response, paging_args, **kwargs):
        response.context['title'] = 'People'
        return self.db.User.page({}, **paging_args)

    @paging_decorator
    def user_exprs(self, request, response, query_args, auth=None, **kwargs):
        if auth: args['auth'] = auth.replace('password', 'private')
        tag = request.args.get('tag')

        link_query = '@' + request.owner['name']
        if tag:
            link_query += ' #' + tag
            query_args['tag'] = tag
        link_args(response, { 'q': link_query })

        return request.owner.expr_page(auth=auth, **query_args)

    @paging_decorator
    def feed_network(self, request, response, paging_args, **kwargs):
        return request.owner.feed_network(**paging_args)

    @paging_decorator
    def feed_activity(self, request, response, by_owner=False, spec={}, **args):
        args.update(query_args(request))
        if by_owner: spec.update({'initiator': request.owner.id})
        return request.owner.feed_profile_entities(spec=spec, **args)

    @paging_decorator
    def listening(self, request, response, paging_args, **kwargs):
        return request.owner.starred_user_page(**paging_args)

    @paging_decorator
    def listeners(self, request, response, paging_args, **kwargs):
        return request.owner.starrer_page(**paging_args)

    @paging_decorator
    def search(self, request, response, args):
        query = request.args.get('q', '')
        link_args(response, { 'q': query } )
        return self.db.query( query, expr_only = request.args.get('expr_only'), **args )

    # destructively prepare state.Expr for client consumption
    def item_prepare(self, item, viewer=None, password=None):
        if type( item ) == state.User: return item.client_view()
        expr = item

        counts = dict([ ( k, large_number( v.get('count', 0) ) ) for
            k, v in expr.get('analytics', {}).iteritems() ])
        counts['Views'] = large_number(expr.views)
        counts['Comment'] = large_number(expr.comment_count)

        # check if auth is required so we can then strip password
        auth_required = expr.auth_required()
        if expr.auth_required(viewer, password):
            for key in ['password', 'thumb', 'thumb_file_id']: expr.pop(key, None)
            dict.update(expr, {
                 'tags': ''
                ,'background': {}
                ,'apps': []
                ,'title': '[Private]'
                ,'tags_index': []
            })

        dict.update(expr, {
            'id': expr.id,
            'thumb': expr.get_thumb(),
            'owner': expr.owner.client_view(viewer=viewer),
            'counts': counts,
            'url': expr.url,
            'auth_required': auth_required,
            'updated_friendly': friendly_date(expr['updated'])
        })

        if viewer.is_admin:
            dict.update(expr, { 'featured': expr.is_featured })

        return expr
