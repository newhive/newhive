#!/usr/bin/env python
# Copyright 2011, Abram Clark & A Reflection Of LLC
# thenewhive.com WSGI server version 0.2

from newhive.controllers.shared import *
from newhive.controllers import ApplicationController
from newhive.controllers import AnalyticsController
from newhive.controllers import AdminController
from newhive.controllers import ExpressionController
from newhive.controllers import MailController
from newhive.controllers import UserController
from newhive.controllers import FileController
from newhive.controllers import StarController
from newhive.controllers import CronController

import os, re, json, mimetypes, math, time, crypt, urllib, base64
from datetime import datetime
from os.path  import dirname, exists, join as joinpath
from werkzeug import Request, Response, exceptions, url_unquote
from werkzeug.routing import Map, Rule
from werkzeug.exceptions import HTTPException, NotFound
from urlparse import urlparse
import jinja2

from newhive import config
from newhive.state import User
from newhive.utils import abs_url
import newhive.state
import ui_strings.en as ui

import webassets
from webassets.filter import get_filter

##############################################################################
#                             webassets setup                                #
##############################################################################
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

##############################################################################
#                                jinja setup                                 #
##############################################################################
jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(joinpath(config.src_home, 'templates')))
jinja_env.trim_blocks = True
jinja_env.filters['friendly_date'] = friendly_date
jinja_env.filters['length_bucket'] = length_bucket
jinja_env.filters['large_number'] = large_number
jinja_env.filters['json'] = json.dumps
jinja_env.filters['mod'] = lambda x, y: x % y
jinja_env.filters['querystring'] = querystring
jinja_env.filters['percentage'] = lambda x: x*100

db = newhive.state.Database(config)
controllers = {
    'analytics':  AnalyticsController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'admin':    AdminController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'user':    UserController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'file':    FileController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'expression':    ExpressionController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'mail':     MailController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'star':     StarController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'cron':     CronController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    }

application_controller = ApplicationController(jinja_env = jinja_env, assets_env = assets_env, db = db)
serve_page = application_controller.serve_page
serve_404 = application_controller.serve_404
serve_json = application_controller.serve_json
expr_list = controllers['expression']._expr_list
expr_home_list = controllers['expression']._expr_home_list
redirect = application_controller.redirect
def dialog_map(request, response, args=None):
    return dialogs.get(request.form['dialog'])(request, response, args)



# Possible values for the POST variable 'action'
actions = dict(
     login           = controllers['user'].login
    ,logout          = controllers['user'].logout
    ,expr_save       = controllers['expression'].save
    ,expr_delete     = controllers['expression'].delete
    ,file_create     = controllers['file'].create
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
    ,log             = controllers['user'].log
    ,thumbnail_relink= controllers['admin'].thumbnail_relink
    ,facebook_invite = controllers['user'].facebook_invite
    ,facebook_listen = controllers['user'].facebook_listen
    ,dialog          = dialog_map
    )

dialogs = dict(
    facebook_listen  = controllers['user'].facebook_listen
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

    request, response = application_controller.pre_process(request)
    content_domain = config.content_domain

##############################################################################
#                                post handler                                #
##############################################################################
    if request.domain != content_domain and request.method == "POST":
        reqaction = request.form.get('action')
        if reqaction:
            insecure_actions = ['add_comment', 'star', 'unstar', 'log', 'mail_us', 'tag_add', 'mail_referral', 'password_recovery', 'mail_feedback', 'facebook_invite', 'dialog']
            non_logged_in_actions = ['login', 'log', 'user_create', 'mail_us', 'password_recovery', 'mail_feedback', 'file_create']
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
               print reqaction
               print "************************would return status 204 here*************************"
               #return Response(status=204) # 204 status = no content

##############################################################################
#                             site_url handler                               #
##############################################################################
    if request.domain == config.server_name:
        parts = request.path.split('/', 1)
        p1 = lget(parts, 0)
        p2 = lget(parts, 1)
        if p1 == 'cron' and request.remote_addr == "127.0.0.1": 
            return controllers['cron'].cron(request, response)
        elif p1 == 'file': return serve_404(request, response)
        elif p1 == 'edit' and request.requester.logged_in:
            return controllers['expression'].default(request, response, {'method': 'edit'})
        elif p1 == 'create_account': return controllers['user'].new(request, response)
        elif p1 == 'settings': return controllers['user'].edit(request, response)
        elif p1 == 'feedback': return serve_page(response, 'pages/feedback.html')
        elif p1 == 'email_confirmation': return controllers['user'].confirm_email(request, response)
        elif p1 in ['', 'home', 'tag', 'people']:
            return controllers['expression'].index(request, response, {'tag': p2, 'p1': p1})
        elif p1 == 'admin_home' and request.requester.logged_in:
            return controllers['admin'].home(request, response)
        elif p1 == 'admin' and request.requester.get('name') in config.admins:
            return controllers['admin'].default(request, response, {'method': p2})
        elif p1 == 'analytics' and request.requester.get('name') in config.admins:
            return controllers['analytics'].default(request, response, {'method': p2})
        elif p1 == 'user_check': return controllers['user'].user_check(request, response)
        elif p1 == 'random': return controllers['expression'].random(request, response)
        elif p1 == 'search': return controllers['expression'].search(request, response)
        elif p1 == 'oauth':  return controllers['user'].facebook_connect(request, response)
        elif p1 == 'fbcanvas':  return controllers['user'].facebook_canvas(request, response)
        elif p1 == 'invited': return controllers['user'].invited(request, response)
        elif p1 == 'signup': return controllers['user'].invited(request, response)
        elif p1 == 'robots.txt' and config.debug_mode: return application_controller.serve_robots(response)
        else: return serve_404(request, response)

    elif request.domain.startswith('www.'):
        return redirect(response, re.sub('www.', '', request.url, 1))

##############################################################################
#                             user_url handler                               #
##############################################################################
    owner = db.User.find(dict(sites=request.domain.lower()))
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
        return controllers['expression'].index(request, response, {'owner': owner})
    if request.path == 'listening': return controllers['user'].index(request, response, {'listening': True})
    if request.path == 'feed': return controllers['user'].index(request, response, {'feed': True})
    if request.path == 'network': return controllers['user'].index(request, response, {'network': True})
    if request.path == 'robots.txt' and config.debug_mode: return application_controller.serve_robots(response)

    if request.args.has_key('dialog'): return controllers['expression'].dialog(request, response)

    return controllers['expression'].show(request, response)


##############################################################################
#                       werkzeug / mod_wsgi entry point                      #
##############################################################################
@Request.application
def handle_debug(request):
    """Allow exceptions to be handled by werkzeug for debugging"""
    return handle(request)

@Request.application
def handle_safe(request):
    """Log exceptions thrown, display friendly error message.
       Not implemneted."""
    try: return handle(request)
    except Exception as e: return serve_error(request, str(e))

application = handle_debug

if __name__ == '__main__':
    from werkzeug.test import EnvironBuilder
    from newhive.oauth import FacebookClient
    get_builder = EnvironBuilder(method='GET', environ_overrides={'wsgi.url_scheme': 'https'})
    get_request = lambda: Request(get_builder.get_environ())

    cara = db.User.named('cara')
    duffy = db.User.named('duffy')
    andrew = db.User.named('andrew')
    abram = db.User.named('abram')
    zach = db.User.named('zach')

