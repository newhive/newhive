from newhive.controllers.shared import *
from newhive.controllers import Application
from newhive.controllers.expression import expr_to_html
from functools import partial
from itertools import chain
from newhive.state import Page

class Community(Application, PagingMixin):

    def __init__(self, **args):
        super(Community, self).__init__(**args)

        self.pages = {
             'search'                     : self.search
            ,'home/expressions'           : self.expr_featured
            ,'home/expressions/all'       : self.expr_all
            ,'home/network'               : self.home_feed
            ,'home/people'                : self.people
            ,'home/page'                  : self.expr_page
            ,'profile/expressions'        : self.user_exprs
            ,'profile/expressions/public' : partial(self.user_exprs, auth='public')
            ,'profile/expressions/private': partial(self.user_exprs, auth='password')
            ,'profile/activity'           : self.feed_profile
            ,'profile/activity/like'      : partial(self.feed_profile, by_owner=True, spec={'class_name':'Star', 'entity_class':'Expr'})
            ,'profile/activity/discussion': partial(self.feed_profile, spec={'class_name':'Comment'})
            ,'profile/activity/broadcast' : partial(self.feed_profile, by_owner=True, spec={'class_name':'Broadcast'})
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

        match_extent = len(path)
        while match_extent > 0:
            res_path = '/'.join(path[0:match_extent])
            query = self.pages.get(res_path)
            if query: break
            match_extent -= 1
        if not query: return self.serve_404(request, response)

        if query == self.expr_all and not request.requester.logged_in:
            return self.redirect(response, abs_url());
        items_and_args = query(request, response)
        content, args = items_and_args if type(items_and_args) == tuple else (items_and_args, None)
        if content == None: return self.serve_404(request, response)
        response.context.update(dict(
             home = path[0] != 'profile'
            ,search = path[0] == 'search'
            ,profile = path[0] == 'profile'
            ,show_prompts = ((path == ['profile','activity','network'] and request.is_owner)
                or (path == ['home','network'])) and (len(request.requester.starred_user_ids) <= 1)
            ,activity = lget(path, 1) == 'activity'
            ,hide_feed = (path[-1] != 'activity') and (path[-1] != 'discussion')
            ,require_login = path == ['home','expressions','all']
            ,path = res_path
            ,path1 = '/'.join(path[0:2])
            ,args = args
            ,community = True
        ))
        response.context.update({
            'cards': content
            ,'next_page': next_page(request, content.next)
        } if hasattr(content, 'next') else {'content': content})

        return self.page(request, response, content)

    def expr_page(self, request, response):
        page = lget(request.path_parts, 2, 'about')
        response.context['title'] = page
        return expr_to_html( self.db.Expr.named( config.site_user, lget(request.path_parts, 2, 'about') ) )

    def search(self, request, response):
        query = request.args.get('q', '')
        res = self.db.KeyWords.search_page(query, **query_args(request))
        entities = { 'User': self.db.User, 'Expr': self.db.Expr }
        for i, e in enumerate(res): res[i] = entities[e['doc_type']].fetch(e['doc'])
        res[:] = filter(lambda e: e and request.requester.can_view(e), res)

        self.db.ActionLog.create(request.requester, "search", data={ 'query': query })
        response.context['title'] = "Results for '{}'".format(query)

        # TODO: if search matches one or more tags, return tags argument
        return res

    def tag(self, request, response):
        tag = lget(request.path_parts, 1)
        items = self.db.Expr.page({ 'tags_index': tag }, **query_args(request))
        paging_args = {'tag': tag}
        response.context.update(dict(
            cards = items,
            next_page = next_page(request, items.next),
            tag_page = True,
            tag = tag,
            home = True,
            args=paging_args,
            title="#{}".format(tag),
            description="Expressions tagged '{}'".format(tag)
        ))
        return self.page(request, response, items)

    def page(self, request, response, content):

        def expr_info(expr):
            expr['thumb'] = expr.get_thumb()
            return dfilter(expr, ['_id', 'thumb', 'title', 'tags', 'owner', 'owner_name'])

        if request.args.get('json'):
            json = map(expr_info, content)
            return self.serve_json(response, json)
        if request.args.get('partial'):
            return self.serve_page(response, 'page_parts/cards.html')

        if request.owner:
            tags = map(
                    lambda t: {'url': '/' + request.owner['name'] + '/profile/expressions?tag=' + t, 'name': t},
                    request.owner.get('tags', []))
        else:
            tags = map(
                    lambda t: {'url': '/tag/' + t, 'name': t},
                    self.db.User.site_user['config']['featured_tags'])

        response.context.update({'tags': tags, 'user_tag': request.args.get('tag') })
        if request.owner:
            response.context.update({ 'title': request.owner['fullname'] })

        return self.serve_page(response, 'pages/community.html')

def next_page(request, page):
    if not page: return None
    next_page = {'partial': 't', 'page': page, 'q': request.args.get('q')}
    return querystring(next_page)

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
