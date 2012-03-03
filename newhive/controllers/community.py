from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from functools import partial

class CommunityController(ApplicationController):

    def __init__(self, *args):
        super(CommunityController, self).__init__(*args)

        self.pages = {
             'home/expressions/featured'  : self.expr_featured
            ,'home/expressions/all'       : self.expr_all
            ,'home/activity'              : self.feed_network
            ,'home/people'                : self.people
            ,'home/about'                 : self.learn
            ,'profile/expressions/all'    : self.user_exprs
            ,'profile/expressions/public' : partial(self.user_exprs, auth='public')
            ,'profile/expressions/private': partial(self.user_exprs, auth='password')
            ,'profile/activity/my'        : self.feed_profile
            ,'profile/activity/network'   : self.feed_network
            ,'profile/listening/listening': self.listening
            ,'profile/listening/listeners': self.listeners
        }

    def index(self, request, response):
        path = request.path_parts

        def default(*p):
            for i in range(len(p)):
                if (i < len(path)) and (lget(path, i) != lget(p, i)): break
                lset(path, i, p[i])
        default('home', 'activity' if request.requester.logged_in else 'expressions')
        default('home', 'expressions', 'featured')
        default('profile', 'expressions', 'all')
        default('profile', 'activity', 'my')
        default('profile', 'listening', 'listening')

        query = self.pages.get('/'.join(path), None)
        if not query: return self.serve_404(request, response)

        response.context.update(dict(
             home = path[0] == 'home'
            ,path = path
            ,cards = query(request)
        ))
        return self.serve_page(response, 'pages/community.html')


    def query_args(self, request):
        return {'page': request.args.get('page', 0), 'viewer': request.requester}

    def expr_featured(self, request):
        return self.db.Expr.list(self.db.User.root_user['tagged']['Featured'], **self.query_args(request))
    def expr_all(self, request): return self.db.Expr.list({}, **self.query_args(request))
    def people(self, request): return self.db.User.search({})
    def learn(self, request):
        return self.db.Expr.list(self.db.User.root_user['tagged']['Featured'], **self.query_args(request))

    def user_exprs(self, request, auth=None): return request.owner.exprs(auth=auth, **self.query_args(request))
    def feed_network(self, request): return request.owner.feed_network(**self.query_args(request))
    def feed_profile(self, request): return request.owner.feed_profile(**self.query_args(request))
    def listening(self, request): return request.owner.starred_users
    def listeners(self, request): return request.owner.starrers


    def _site_index(self, request, response, args={}):
        tag = args.get('tag')
        p1 = args.get('p1')
        request, response = self._homepage(request, response, args)
        if p1 == 'people':
            cname = 'user'
        else:
            cname = 'expr'
        self._expr_home_list(args.get('tag'), request, response, cname=cname)
        if tag: response.context['expr_context'] = {'tag': tag }
        elif p1 == '':
            response.context['expr_context'] = {'tag': 'Featured'}
        if p1 == 'tag':
            response.context['exprs'] = self._expr_list({'tags_index':tag.lower()}, page=int(request.args.get('page', 0)), limit=90)
            if int(request.args.get('page', 0)) == 0 and ExpressionController.featured.has_key(tag):
                expr_list = self._expr_list(ExpressionController.featured[tag])
                response.context['exprs'] += expr_list
                response.context['exprs'] = utils.uniq(response.context['exprs'], lambda x: x.id)
            response.context['tag'] = tag
            response.context['title'] = "#" + tag
        if request.args.get('partial'): return self.serve_page(response, 'page_parts/cards.html')
        elif p1 == 'tag': return self.serve_page(response, 'pages/tag_search.html')
        else:
            return self.serve_page(response, 'pages/home.html')

    def search(self, request, response, args={}):
        query = request.args.get('q')
        request, response = self._homepage(request, response, args)
        results = self.db.KeyWords.text_search(query, doc_type='Expr')
        ids = [res['doc'] for res in results]
        expressions = self._expr_list(ids, viewer=request.requester.id)
        results = self.db.KeyWords.text_search(query, doc_type='User')
        ids = [res['doc'] for res in results]
        users = self.db.User.list({'_id': {'$in': ids}})
        self.db.ActionLog.create(request.requester, "search", data={'query': query, 'result_size': len(expressions)})
        response.context['exprs'] = expressions
        response.context['users'] = users
        response.context['tag'] = {}
        response.context['title'] = "Results for: " + query
        response.context['query'] = query
        response.context['pages'] = 1
        return self.serve_page(response, 'pages/tag_search.html')

    def _expr_list(self, spec, **args):
        return map(self._format_card, self.db.Expr.list(spec, **args))

    def expr_card_list(self, items): return map(self._format_expr_card, items)

    def _format_expr_card(self, e):
        if not e.get('formatted_as_card'):
            dict.update(e
                ,updated = friendly_date(time_u(e['updated']))
                ,tags = e.get('tags_index', [])
                ,formatted_as_card = True
                )
        return e

    def _expr_home_list(self, p2, request, response, limit=90, cname='expr'):
        root = self.db.User.get_root()
        tag = p2 if p2 else lget(root.get('tags'), 0) # make first tag/category default community page
        tag = {'name': tag, 'url': '/home/' + tag}
        page = int(request.args.get('page', 0))
        ids = root.get('tagged', {}).get(tag['name'], []) if cname == 'expr' else []
        cols = { 'expr' : self.db.Expr, 'user' : self.db.User }
        if ids:
            by_id = {}
            for e in cols[cname].list({'_id' : {'$in':ids}}, viewer=request.requester.id): by_id[e['_id']] = e
            entities = [by_id[i] for i in ids if by_id.has_key(i)]
            response.context['pages'] = 0;
        else:
            entities = cols[cname].list({}, sort='updated', limit=limit, page=page)
            response.context['pages'] = cols[cname].count({});
        if cname=='expr':
            response.context['exprs'] = map(self._format_card, entities)
            response.context['tag'] = tag
            response.context['show_name'] = True
        elif cname=='user': response.context['users'] = entities
        response.context['page'] = page
