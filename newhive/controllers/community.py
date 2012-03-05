from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from functools import partial
from itertools import chain

class CommunityController(ApplicationController):

    def __init__(self, *args):
        super(CommunityController, self).__init__(*args)

        self.pages = {
             'home/expressions'           : self.expr_featured
            ,'home/expressions/all'       : self.expr_all
            ,'home/network'               : self.home_feed
            ,'home/people'                : self.people
            ,'home/about'                 : self.learn
            ,'profile/expressions'        : self.user_exprs
            ,'profile/expressions/public' : partial(self.user_exprs, auth='public')
            ,'profile/expressions/private': partial(self.user_exprs, auth='password')
            ,'profile/activity'           : self.feed_profile
            ,'profile/activity/network'   : self.feed_network
            ,'profile/listening'          : self.listening
            ,'profile/listening/listeners': self.listeners
        }

    def index(self, request, response):
        path = request.path_parts

        def default(*p):
            for i in range(len(p)):
                if lget(path, i) and lget(path, i) != lget(p, i): break
                lset(path, i, p[i])
        default('home', 'network' if request.requester.logged_in else 'expressions')
        default('profile', 'expressions')
        print path

        res_path = '/'.join(path)
        query = self.pages.get(res_path)
        if not query: return self.serve_404(request, response)
        items = expr_list(query(request))
        response.context.update(dict(
             home = path[0] == 'home'
            ,profile = path[0] == 'profile'
            ,path = res_path
            ,path1 = '/'.join(path[0:2])
            ,cards = items
            ,pages = 10
        ))
        return self.serve_page(response, 'pages/community.html')


    def query_args(self, request):
        return {'page': request.args.get('page', 0), 'viewer': request.requester}

    def expr_featured(self, request):
        return self.db.Expr.list(self.db.User.root_user['tagged']['Featured'], **self.query_args(request))
    def expr_all(self, request): return self.db.Expr.list({}, **self.query_args(request))
    def home_feed(self, request): return request.requester.feed_network(**self.query_args(request))
    def people(self, request): return self.db.User.search({})
    def learn(self, request):
        return self.db.Expr.list(self.db.User.root_user['tagged']['Learn'], **self.query_args(request))

    def user_exprs(self, request, auth=None): return request.owner.exprs(auth=auth, **self.query_args(request))
    def feed_network(self, request): return request.owner.feed_network(**self.query_args(request))
    def feed_profile(self, request): return request.owner.feed_profile_exprs(**self.query_args(request))
    def listening(self, request): return request.owner.starred_users
    def listeners(self, request): return request.owner.starrers


    def search(self, request, response, args={}):
        query = request.args.get('q')
        expr_res = self.db.KeyWords.text_search(query, doc_type='Expr')
        ids = [res['doc'] for res in expr_res]
        expressions = self.db.Expr.list(ids, viewer=request.requester.id)

        user_res = self.db.KeyWords.text_search(query, doc_type='User')
        ids = [res['doc'] for res in user_res]
        users = self.db.User.list({'_id': {'$in': ids}})

        self.db.ActionLog.create(request.requester, "search", data={'query': query,
            'expr_count': expr_res.count(), 'user_count': user_res.count() })

        res = expr_list(chain(users, expressions))

        response.context.update(dict(
             home = True
            ,search = True
            ,title = 'Results for: ' + query
            ,path = 'home/search'
            ,cards = res
            ,pages = 10
        ))
        return self.serve_page(response, 'pages/community.html')


def expr_list(res): return map(format_card, res)

def format_card(e):
    dict.update(e
        ,updated = friendly_date(time_u(e['updated']))
        ,tags = e.get('tags_index', [])
        )
    return e
