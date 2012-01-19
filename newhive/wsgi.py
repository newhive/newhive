#!/usr/bin/env python
# Copyright 2011, Abram Clark & A Reflection Of LLC
# thenewhive.com WSGI server version 0.2

from newhive.controllers.shared import *
from newhive.controllers import ApplicationController, AnalyticsController, AdminController, ExpressionController, MailController, UserController, FileController, StarController

import os, re, json, mimetypes, math, time, crypt, urllib, base64
from datetime import datetime
from os.path  import dirname, exists, join as joinpath
from werkzeug import Request, Response, exceptions, url_unquote
from urlparse import urlparse
import jinja2

from newhive import config, auth, colors
from newhive.state import Expr, File, User, Contact, Referral, DuplicateKeyError, get_root, abs_url, Comment, Star, ActionLog, db, junkstr
from newhive.utils import time_u, normalize, junkstr
import newhive.state
import ui_strings.en as ui

import webassets
from webassets.filter import get_filter

assets_env = webassets.Environment(joinpath(config.src_home, 'libsrc'), '/lib')
if config.webassets_debug:
    assets_env.debug = True
    assets_env.updater = "always"
    assets_env.set_url('/lib/libsrc')
    scss = webassets.Bundle('scss/base.scss', filters=get_filter('scss', compass=True), output='../lib/scss.css', debug=False)
else: scss = 'scss.css'
assets_env.register('edit.js', 'filedrop.js', 'upload.js', 'editor.js', filters='yui_js', output='../lib/edit.js')
assets_env.register('app.js', 'jquery.js', 'jquery_misc.js', 'rotate.js', 'hover.js',
    'drag.js', 'dragndrop.js', 'colors.js', 'util.js', filters='yui_js', output='../lib/app.js')
assets_env.register('harmony_sketch.js', 'harmony_sketch.js', filters='yui_js', output='../lib/harmony_sketch.js')

assets_env.register('admin.js', 'raphael/raphael.js', 'raphael/g.raphael.js', 'raphael/g.pie.js', 'raphael/g.line.js', 'jquery.tablesorter.min.js', 'jquery-ui/jquery-ui-1.8.16.custom.min.js', 'd3/d3.js', output='../lib/admin.js')
assets_env.register('admin.css', 'jquery-ui/jquery-ui-1.8.16.custom.css', output='../lib/admin.css')

assets_env.register('app.css', scss, 'app.css', filters='yui_css', output='../lib/app.css')
assets_env.register('base.css', 'base.css', filters='yui_css', output='../lib/base.css')
assets_env.register('editor.css', 'editor.css', filters='yui_css', output='../lib/editor.css')
assets_env.register('expression.js', 'expression.js', filters='yui_js', output='../lib/expression.js')

jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(joinpath(config.src_home, 'templates')))
jinja_env.trim_blocks = True

controllers = {
    'analytics':  AnalyticsController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
    , 'admin':    AdminController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
    , 'user':    UserController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
    , 'file':    FileController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
    , 'expression':    ExpressionController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
    , 'mail':     MailController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
    , 'star':     StarController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
    }

application_controller = ApplicationController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
serve_page = application_controller.serve_page
serve_404 = application_controller.serve_404
serve_json = application_controller.serve_json
#serve_html = application_controller.serve_html
#serve_page = application_controller.serve_page
expr_list = controllers['expression']._expr_list
expr_home_list = controllers['expression']._expr_home_list
redirect = application_controller.redirect

def no_more_referrals(referrer, request, response):
    response.context['content'] = 'User %s has no more referrals' % referrer
    return serve_page(response, 'pages/minimal.html')
def log(request, response):
    action = request.form.get('log_action')
    user = request.requester
    if action == "notifications_open":
        user.notification_count = 0

    data = json.loads(request.form.get('data', 'false'))
    if not data:
        data = {}
    l = ActionLog.new(user, request.form.get('log_action'), data)
    return True

# Possible values for the POST variable 'action'
actions = dict(
     login           = controllers['user'].login
    ,logout          = controllers['user'].logout
    ,expr_save       = controllers['expression'].save
    ,expr_delete     = controllers['expression'].delete
    ,files_create    = controllers['file'].create
    ,file_delete     = controllers['file'].delete
    ,user_create     = controllers['user'].create
    ,user_update     = controllers['user'].update
    ,password_recovery = controllers['user'].password_recovery
    ,mail_us         = controllers['mail'].mail_us
    ,mail_them       = controllers['mail'].mail_them
    ,mail_referral   = controllers['mail'].mail_referral
    ,mail_feedback   = controllers['mail'].mail_feedback
    ,user_tag_add    = controllers['user'].tag_update
    ,user_tag_remove = controllers['user'].tag_update
    ,tag_remove      = controllers['expression'].tag_update
    ,tag_add         = controllers['expression'].tag_update
    ,admin_update    = controllers['admin'].admin_update
    ,add_referral    = controllers['admin'].add_referral
    ,add_comment     = controllers['expression'].add_comment
    ,bulk_invite     = controllers['admin'].bulk_invite
    ,profile_thumb_set  = controllers['user'].profile_thumb_set
    ,star            = controllers['star'].star
    ,unstar          = controllers['star'].star
    ,log             = log
    ,thumbnail_relink= controllers['admin'].thumbnail_relink
    )

# Mime types that could generate HTTP POST requests
#unsafe_mimes = {
#      'text/xml'                       : True
#    , 'application/xml'                : True
#    , 'application/xhtml'              : True
#    , 'application/x-shockwave-flash'  : True
#    , 'text/x-sgml'                    : True
#    , 'text/html'                      : True
#    , 'text/xhtml'                     : True
##    , 'application/x-javascript'       : True
#    }

def handle(request): # HANDLER
    """The HTTP handler, main entry point from Werkzeug.
       All POST requests must be sent to thenewhive.com, as opposed to
       user.thenewhive.com which can contain arbitrary scripts. Any
       response for thenewhive.com must not contain unsanitized user content.
       Accepts werkzeug.Request, returns werkzeug.Response"""


    response = Response()
    request.requester = auth.authenticate_request(request, response)
    response.context = { 'f' : request.form, 'q' : request.args, 'url' : request.url }
    response.user = request.requester
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'x-requested-with')

    request.path = request.path[1:] # drop leading '/'
    request.domain = request.host.split(':')[0].lower()
    content_domain = "usercontent." + config.server_name

########################
#     post handler     #
########################
    if request.domain != content_domain and request.method == "POST":
        reqaction = request.form.get('action')
        if reqaction:
            insecure_actions = ['add_comment', 'star', 'unstar', 'log', 'mail_us', 'tag_add', 'mail_referral', 'password_recovery', 'mail_feedback']
            non_logged_in_actions = ['login', 'log', 'user_create', 'mail_us', 'password_recovery', 'mail_feedback']
            if not request.is_secure and not reqaction in insecure_actions:
                raise exceptions.BadRequest('post request action "' + reqaction + '" is not secure')
            if not request.requester.logged_in and not reqaction in non_logged_in_actions:
                raise exceptions.BadRequest('post request action "' + reqaction + '" is not logged_in')

            if urlparse(request.headers.get('Referer')).hostname == content_domain:
                raise exceptions.BadRequest('invalid cross site post request from: ' + request.headers.get('Referer'))

            if not actions.get(reqaction): raise exceptions.BadRequest('invalid action: '+reqaction)
            r = actions.get(reqaction)(request, response)
            if type(r) == Response: return r
            if r != None: return serve_json(response, r, as_text = True)
            elif reqaction != 'logout':
               print "************************would return status 204 here*************************"
               #return Response(status=204) # 204 status = no content

    if request.domain == config.server_name:
        parts = request.path.split('/', 1)
        p1 = lget(parts, 0)
        p2 = lget(parts, 1)
        if p1 == 'api':
            if p2 == 'notifications_opened':
                response = Response()
                origin = request.headers.get('origin')
                response.headers.add('Access-Control-Allow-Credentials', 'true')
                response.headers.add('Access-Control-Allow-Origin', origin)
                return serve_json(response, True)
        if p1 == 'file': return serve_404(request, response)
        elif p1 == 'edit' and request.requester.logged_in:
            return controllers['expression'].default(request, response, {'method': 'edit'})
        elif p1 == 'signup': return controllers['user'].new(request, response)
        elif p1 == 'settings': return controllers['user'].edit(request, response)
        elif p1 == 'feedback': return serve_page(response, 'pages/feedback.html')
        elif p1 == 'email_confirmation': return controllers['user'].email_confirmation(request, response)
        elif p1 in ['', 'home', 'people', 'tag']:
            featured_tags = ["art", "seattle", "music", "poem", "occupy", "love", "drawing", "life", "story",
                '2012', 'photography', 'poetry', 'words', 'food', 'travel', 'inspiration']
            tags = get_root().get('tags', [])
            response.context['system_tags'] = map(lambda t: {'url': "/home/" + t, 'name': t}, tags)
            people_tag = {'url': '/people', 'name': 'People'}
            response.context['system_tags'].append(people_tag)
            response.context['tags'] = [{'url': '/tag/' + t, 'name': t} for t in featured_tags ]
            if p1 == 'people':
                response.context['tag'] = people_tag
                klass = User
            else:
                klass = Expr
            expr_home_list(p2, request, response, klass=klass)
            if p2: response.context['expr_context'] = {'tag': p2 }
            elif p1 == '':
                response.context['expr_context'] = {'tag': 'Featured'}
            if p1 == 'tag':
                response.context['exprs'] = expr_list({'tags_index':p2.lower()}, page=int(request.args.get('page', 0)), limit=90)
                response.context['tag'] = p2
            if request.args.get('partial'): return serve_page(response, 'page_parts/cards.html')
            elif p1 == 'tag': return serve_page(response, 'pages/tag_search.html')
            else:
                return serve_page(response, 'pages/home.html')
        elif p1 == 'admin_home' and request.requester.logged_in:
            root = get_root()
            if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
            response.context['tags_js'] = json.dumps(root.get('tags'))
            response.context['tagged_js'] = json.dumps(root.get('tagged'), indent=2)

            expr_home_list(p2, request, response, limit=900)
            return serve_page(response, 'pages/admin_home.html')
        elif p1 == 'admin' and request.requester.get('name') in config.admins:
            return controllers['admin'].default(request, response, {'method': p2})
        elif p1 == 'analytics' and request.requester.get('name') in config.admins:
            return controllers['analytics'].default(request, response, {'method': p2})
        elif p1 == 'contacts' and request.requester.get('name') in config.admins:
            response.headers.add('Content-Disposition', 'inline', filename='contacts.csv')
            response.data = "\n".join([','.join(map(json.dumps, [o.get('name'), o.get('email'), o.get('referral'), o.get('message'), o.get('url'), str(time_u(int(o['created'])))])) for o in Contact.search()])
            response.content_type = 'text/csv; charset=utf-8'
            return response
        elif p1 == 'comments':
            expr = Expr.named(request.args.get('domain'), request.args.get('path')[1:])
            response.context['exp'] = response.context['expr'] = expr
            response.context['max_height'] = request.args.get('max_height')
            if request.requester.logged_in:
                ActionLog.new(request.requester, "view_comments", data={'expr_id': expr.id})
            return serve_page(response, 'dialogs/comments.html')
        elif p1 == 'user_check': return controllers['user'].user_check(request, response)
        elif p1 == 'random':
            expr = Expr.random()
            if request.requester.logged_in:
                ActionLog.new(request.requester, "view_random_expression", data={'expr_id': expr.id})
            return redirect(response, expr.url)
         #else:
        #    # search for expressions with given tag
        #    exprs = Expr.list({'_id' : {'$in':ids}}, requester=request.requester.id, sort='created') if tag else Expr.list({}, sort='created')
        #    response.context['exprs'] = map(format_card, exprs)
        #    response.context['tag'] = tag
        #    response.context['tags'] = root.get('tags', [])
        #    response.context['show_name'] = True
        #    return serve_page(response, 'pages/home.html')

        return serve_404(request, response)
    elif request.domain.startswith('www.'):
        return redirect(response, re.sub('www.', '', request.url, 1))

    owner = User.find(sites=request.domain.lower())
    if not owner: return serve_404(request, response)
    is_owner = request.requester.logged_in and owner.id == request.requester.id

    response.context.update(
         domain = request.domain
        ,owner = owner
        ,owner_url = owner.url
        ,path = request.path
        ,user_is_owner = is_owner
        ,create_expr_card = re.match('expressions', request.path) and is_owner
        )

    if request.path.startswith('expressions') or request.path == 'starred':
        return controllers['expression'].index(request, response)
    if request.path == 'listening': return controllers['user'].index(request, response, {'listening': True})
    if request.path == 'feed':
        if not request.requester.logged_in:
            return redirect(response, abs_url())
        response.context['feed_items'] = request.requester.feed
        tag = feed_tag

        response.context['title'] = owner['fullname']
        response.context['tag'] = tag
        response.context['tags'] = map(lambda t: {'url': "/expressions/" + t, 'name': t, 'type': 'user'}, tags)
        if request.requester.logged_in and is_owner:
            response.context['system_tags'].insert(1, feed_tag)
        response.context['profile_thumb'] = owner.thumb
        response.context['starrers'] = map(User.fetch, owner.starrers)

        return serve_page(response, 'pages/expr_cards.html')
        #response.context['page'] = page

    if request.args.has_key('dialog'): return controllers['expression'].dialog(request, response)

    if lget(request.path, 0) == '*':
        return redirect(response, owner.url +
            ('/' + request.path[1:] if len(request.path) > 1 else ''), permanent=True)

    #if not resource_requested: return serve_404(request, response)

    return controllers['expression'].show(request, response)
@Request.application
def handle_safe(request):
    """Log exceptions thrown, display friendly error message.
       Not implemneted."""
    try: return handle(request)
    except Exception as e: return serve_error(request, str(e))

@Request.application
def handle_debug(request):
    """Allow exceptions to be handled by werkzeug for debugging"""
    return handle(request)

application = handle_debug
#if config.debug_mode: application = handle_debug
#else: application = handle_safe



print joinpath(config.src_home, 'templates')

class InternalServerError(exceptions.InternalServerError):
    def get_body(self, environ):
        return "Something's broken inside"

#class DangerousContent(exceptions.UnsupportedMediaType):
#    def get_body(self, environ):
#        return "If you saw this, something bad could happen"

class Forbidden(exceptions.Forbidden):
    def get_body(self, environ):
        return "You can no looky sorry"

jinja_env.filters['friendly_date'] = friendly_date
jinja_env.filters['length_bucket'] = length_bucket
jinja_env.filters['large_number'] = large_number

jinja_env.filters['mod'] = lambda x, y: x % y
jinja_env.filters['querystring'] = querystring

