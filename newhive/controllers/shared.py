import os, re, json, time, mimetypes, math
from datetime import datetime
from newhive import config, colors, auth
import newhive.ui_strings.en as ui
from newhive.utils import *
import urllib

def admins(server):
    def access_controlled(self, request, response, *arg, **kwarg):
        if request.requester.get('name') not in config.admins:
            return self.serve_404(request, response, *arg, **kwarg)
        elif not request.is_secure:
            return self.redirect(
                    response, abs_url(secure=True) + request.path + '?' + request.query_string)
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
    args = request.args.copy().to_dict(flat=True)
    args = dfilter(args, ['sort', 'page', 'expr', 'order', 'limit'])
    args['viewer'] = request.requester
    if args.has_key('order'): args['order'] = int(args['order'])
    if args.has_key('limit'): args['limit'] = int(args['limit'])
    return args

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
            cards_and_args = func(self, request, response, paging_args, **kwargs)
            (cards, args) = cards_and_args if type(cards_and_args) == tuple else (cards_and_args, None)
            response.context.update( cards = cards, args = args )
            self.set_next_page( request, response, cards )
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

    @paging_decorator
    def search(self, request, response, args):
        search = self.parse_query( request.args.get('q', '') )
        sort = 'updated'

        page_anchor = args.get('page')
        if is_mongo_key(page_anchor):
            res = self.db.Expr.fetch(page_anchor) or self.db.User.fetch(page_anchor)
            args['page'] = res[sort]
        
        spec = {}
        if search.get('text'): spec['text_index'] = { '$all': search['text'] }
        if search.get('tags'): spec['tags_index'] = { '$all': search['tags'] }
        if search.get('user'): spec['owner_name'] = search['user']
        if search.get('auth'): spec['auth'] = 'public' if search['auth'] == 'public' else 'password'
        if search.get('featured'):
            spec['_id'] = { '$in': self.db.User.root_user['tagged']['Featured'] }

        print spec
        if search.get('network'): exprs = request.owner.feed_network(spec=spec, **args)
        else: exprs = self.db.Expr.page(spec, **args)
        return exprs

    def parse_query(self, q):
        """ Parses search query into MongoDB spec
            #tag @user and :ATTR are parsed (where ATTR is "public" or "private")
        """

        # split into lower-cased words with possible [@#:] prefix
        search = { 'text': [], 'tags': [] }
        for pattern in re.findall(r'(\b|\W+)(\w+)', q.lower()):
            prefix = re.sub( r'[^#@:]', '', pattern[0] )
            if prefix == '@': search['user'] = pattern[1]
            elif prefix == '#': search['tags'].append( pattern[1] )
            elif prefix == ':':
                if pattern[1] == 'public':  search['auth'] = 'public' 
                if pattern[1] == 'private': search['auth'] = 'password'
                if pattern[1] == 'featured': search['featured'] = True
                if pattern[1] == 'network': search['network'] = True
            else: search['text'].append( pattern[1] )

        return search
