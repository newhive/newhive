from newhive.controllers.shared import *
from newhive.controllers import Application
from functools import partial
from itertools import chain
from newhive.state import Page
from newhive import utils

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
            ,'profile/expressions/public' : partial( self.user_exprs, auth='public' )
            ,'profile/expressions/private': partial( self.user_exprs, auth='password' )
            ,'profile/activity'           : self.feed_activity
            ,'profile/activity/like'      : partial( self.feed_activity, by_owner=True,
                spec={'class_name':'Star', 'entity_class':'Expr'} )
            ,'profile/activity/discussion': partial( self.feed_activity,
                spec={'class_name':'Comment'} )
            ,'profile/activity/broadcast' : partial( self.feed_activity,
                by_owner=True, spec={'class_name':'Broadcast'} )
            ,'profile/activity/network'   : self.feed_network
            ,'profile/listening'          : self.listening
            ,'profile/listening/listeners': self.listeners
        }

    def index(self, tdata, request, response, id=None):
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

        # must be logged in to view all expressions
        if query in [self.expr_all, self.expr_featured, self.home_feed, self.people, self.expr_page]\
            and not request.requester.logged_in:
            return self.redirect(response, abs_url());

        query(request, response)
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
            ,community = True
        ))

        return self.page(request, response)

    def expr_page(self, request, response):
        page = lget(request.path_parts, 2, 'about')
        response.context.update({
            'title': page,
            'content': self.expr_to_html( self.db.Expr.named(
                config.site_user, lget(request.path_parts, 2, 'about') ) )
        })

    def tag(self, request, response):
        tag = lget(request.path_parts, 1)
        items = self.db.Expr.page({ 'tags_index': tag }, **query_args(request))
        self.set_next_page( request, response, items )
        response.context.update(dict(
            cards = items,
            tag_page = True,
            tag = tag,
            home = True,
            args = { 'q': '#' + tag },
            title = "#{}".format(tag),
            description = "Expressions tagged '{}'".format(tag)
        ))
        return self.page(request, response)

    def page(self, request, response):
        def expr_info(expr):
            info = dfilter(expr, ['_id', 'name', 'feed', 'thumb', 'title', 'tags', 'tags_index', 'owner', 'owner_name'])
            dict.update(info, id = expr.id, thumb = expr.get_thumb() )
            return info

        if request.args.get('json'):
            json = response.context.get('cards')
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

    def expr_to_html(self, exp):
        """Converts JSON object representing an expression to HTML"""
        if not exp: return ''

        def css_for_app(app):
            css = {
                    'left': app['position'][0]
                    , 'top': app['position'][1]
                    , 'z-index': app['z']
                    , 'width': app['dimensions'][0]
                    , 'height': app['dimensions'][1]
                    , 'opacity': app.get('opacity', 1)
                    , 'font-size': app.get('scale')
                    }
            rv = "left: {left}px; top: {top}px; z-index: {z-index}; opacity: {opacity};".format(**css)
            if not app.get('type') == 'hive.raw_html':
                rv += "width: {width}px; height: {height}px; ".format(**css)
            if app.get('scale'):
                rv += "font-size: {font-size}em;".format(**css)
            return rv

        def html_for_app(app):
            content = app.get('content', '')
            more_css = ''
            type = app.get('type')
            id = app.get('id', app['z'])
            if type == 'hive.image':
                html = "<img src='%s'>" % content
                link = app.get('href')
                if link: html = "<a href='%s'>%s</a>" % (link, html)
            elif type == 'hive.sketch':
                html = "<img src='%s'>" % content.get('src')
            elif type == 'hive.rectangle':
                c = app.get('content', {})
                more_css = ';'.join([p + ':' + str(c[p]) for p in c])
                html = ''
            elif type == 'hive.html':
                html = ""
            else:
                html = content
            data = " data-angle='" + str(app.get('angle')) + "'" if app.get('angle') else ''
            data += " data-scale='" + str(app.get('scale')) + "'" if app.get('scale') else ''
            return "<div class='happ %s' id='app%s' style='%s'%s>%s</div>" %\
                (type.replace('.', '_'), id, css_for_app(app) + more_css, data, html)

        app_html = map( html_for_app, exp.get('apps', []) )
        if exp.has_key('dimensions'):
            app_html.append("<div id='expr_spacer' class='happ' style='top: {}px;'></div>".format(exp['dimensions'][1]))
        if exp.has_key('fixed_width'):
            app_html = ['<div class="expr_container" style="width: {}px">'.format(exp['fixed_width'])] + \
                app_html + ['</div>']
        return ''.join(app_html)



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
