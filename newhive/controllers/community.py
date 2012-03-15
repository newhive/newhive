from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from functools import partial
from itertools import chain

class CommunityController(ApplicationController):

    def __init__(self, *args):
        super(CommunityController, self).__init__(*args)

        self.pages = {
             'search'                     : self.search
            ,'home/expressions'           : self.expr_featured
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

        res_path = '/'.join(path)
        query = self.pages.get(res_path)
        if not query: return self.serve_404(request, response)
        items = expr_list(query(request))
        response.context.update(dict(
             home = path[0] != 'profile'
            ,search = path[0] == 'search'
            ,profile = path[0] == 'profile'
            ,network = lget(path, 1) == 'network'
            ,path = res_path
            ,path1 = '/'.join(path[0:2])
            ,cards = items
            ,pages = 10
        ))
        return self.page(request, response)


    def expr_featured(self, request):
        return self.db.Expr.list(self.db.User.root_user['tagged']['Featured'], **query_args(request))
    def expr_all(self, request): return self.db.Expr.list({'auth': 'public'}, **query_args(request))
    def home_feed(self, request): return request.requester.feed_network(**query_args(request))
    def people(self, request): return self.db.User.list({}, **query_args(request))
    def learn(self, request):
        return self.db.Expr.list(self.db.User.root_user['tagged']['Learn'], **query_args(request))

    def user_exprs(self, request, auth=None):
        return request.owner.exprs(auth=auth, tag=request.args.get('tag'), **query_args(request))
    def feed_network(self, request): return request.owner.feed_network(**query_args(request))
    def feed_profile(self, request): return request.owner.feed_profile_entities(**query_args(request))
    def listening(self, request): return request.owner.starred_users
    def listeners(self, request): return request.owner.starrers

    def search(self, request):
        query = request.args.get('q')
        expr_res = self.db.KeyWords.text_search(query, doc_type='Expr')
        ids = [res['doc'] for res in expr_res]
        expressions = self.db.Expr.list(ids, viewer=request.requester.id)

        user_res = self.db.KeyWords.text_search(query, doc_type='User')
        ids = [res['doc'] for res in user_res]
        users = self.db.User.list({'_id': {'$in': ids}})

        self.db.ActionLog.create(request.requester, "search", data={'query': query,
            'expr_count': expr_res.count(), 'user_count': user_res.count() })
        return chain(users, expressions)

    def tag(self, request, response):
        tag = lget(request.path_parts, 1)
        items = self.db.Expr.list({ 'tags_index': tag }, **query_args(request))
        response.context.update(dict( cards = expr_list(items), tag_page = True, tag = tag ))
        return self.page(request, response)

    def page(self, request, response):
        if request.args.get('partial'):
            return self.serve_page(response, 'page_parts/cards.html')

        if request.owner: tags = map(lambda t: {'url': '/profile/expressions?tag=' + t, 'name': t}, request.owner.get('tags', []))
        else: tags = map(lambda t: {'url': '/tag/' + t, 'name': t}, self.db.User.site_user['config']['featured_tags'])
        response.context.update({'tags': tags, 'user_tag': request.args.get('tag') })
        if request.owner: response.context.update({ 'title': request.owner['fullname'] })
        return self.serve_page(response, 'pages/community.html')


def query_args(request):
    return {'page': int(request.args.get('page', 0)), 'viewer': request.requester}

def expr_list(res): return map(format_card, res)

def format_card(e):
    dict.update(e
        ,updated = friendly_date(time_u(e['updated']))
        ,tags = e.get('tags_index', [])
        )
    return e

#def action_text(feed, user):
#    def person(p): return 'you' if p.id == user.id else p['name']
#
#    if feed['entity_class'] == 'User' and feed['class_name'] == 'Star':
#        return person(feed
#
#{% macro person(user, you) %}
#  {{ 'you' if user == you else user.name }}
#{%- endmacro %}
#
#{% macro action_text(feed, user) %}
#  {% if feed.entity['entity_class'] == 'User' %}
#    {% if feed.class_name == 'Star' %}
#      {% if item.feed[0].initiator == user %}
#
#  <div id = "btn_comment" class="hoverable nav_icon has_count" data-count="{{count}}" onclick='loadDialog("?dialog=comments");'>
#    <img src='/lib/skin/1/discussion.png' class='hoverable ' title="Discussions">
#  </div>
#{%- endmacro %}
#
#        <div>you're listening to {{ item.feed[0].entity.name }}</div>
#      {% elif item.feed[0].class_name == 'Star' and item.feed[0].entity == user %}
#        <div>{{ item.feed[0].initiator.name }} is listening to you</div>
#      {% elif item.feed[0].class_name == 'Star' %}
#        <div>{{ item.feed[0].initiator.name }} is listening to {{ item.feed[0].entity.name }}</div>
#      {% else %}
#        <div>{{ 'you' if item.feed[0].initiator == user else item.feed[0].initiator.name }}
#          {{ item.feed[0].action_name }}</div>
#      {% endif %}
