#!/usr/bin/env python
# Copyright 2011, Abram Clark & A Reflection Of LLC
# thenewhive.com WSGI server version 0.2

from newhive.controllers.shared import *
from newhive.controllers import (
     ApplicationController
    ,AnalyticsController
    ,AdminController
    ,ExpressionController
    ,MailController
    ,CommunityController
    ,UserController
    ,FileController
    ,StarController
    ,BroadcastController
    ,CronController
)

import os, re, json, mimetypes, math, time, crypt, urllib, base64
from datetime import datetime
from os.path  import join
from werkzeug import Request, Response, exceptions, url_unquote
from werkzeug.routing import Map, Rule
from werkzeug.exceptions import HTTPException, NotFound
from urlparse import urlparse
import jinja2

from newhive import config
from newhive.utils import abs_url, now
from newhive.assets import Assets
import newhive.colors
import newhive.state
import newhive.manage.git
import newhive.assets

import webassets
import webassets.script

import logging
logger = logging.getLogger(__name__)
logger.info("Initializing WSGI")


##############################################################################
#                   Ass sets, oh my! (static content tool chain)             #
##############################################################################
assets_env = webassets.Environment(join(config.src_home, 'libsrc'), '/lib')
assets_env.updater = 'always'
assets_env.url_expire = True
def urls_with_expiry(self):
    urls = self.urls()
    if self.env.debug:
        rv = []
        for u in urls:
            parts = u.split('?')
            name = parts[0]
            query = lget(parts, 1)
            if not query:
                query = str(int(os.stat(config.src_home + name).st_mtime))
            rv.append(name + '?' + query)
        return rv
    else:
        return urls
webassets.bundle.Bundle.urls_with_expiry = urls_with_expiry

# get assets that webasset bundles depend on (just images and fonts), generate scss include
print('Fetching assets for scss...')
hive_assets = Assets('lib').find('skin').find('fonts')
hive_assets.write_ruby('libsrc/scss/compiled.asset_paths.rb')

print('Compiling css and js...')
assets_env.register('edit.js', 'filedrop.js', 'upload.js', 'editor.js', 'jplayer/jquery.jplayer.js', 'jplayer/skin.js', filters='yui_js', output='../lib/edit.js')
assets_env.register('app.js', 'jquery.js', 'jquery_misc.js', 'rotate.js', 'hover.js',
    'drag.js', 'dragndrop.js', 'colors.js', 'util.js', 'jplayer/jquery.jplayer.js', filters='yui_js', output='../lib/app.js')
assets_env.register('harmony_sketch.js', 'harmony_sketch.js', filters='yui_js', output='../lib/harmony_sketch.js')

assets_env.register('admin.js', 'raphael/raphael.js', 'raphael/g.raphael.js', 'raphael/g.pie.js', 'raphael/g.line.js', 'jquery.tablesorter.min.js', 'jquery-ui/jquery-ui-1.8.16.custom.min.js', 'd3/d3.js', 'd3/d3.time.js', output='../lib/admin.js')
assets_env.register('admin.css', 'jquery-ui/jquery-ui-1.8.16.custom.css', output='../lib/admin.css')

scss_filter = webassets.filter.get_filter('scss', use_compass=True, debug_info=False,
    libs=[join(config.src_home, 'libsrc/scss/asset_url.rb')])
scss = webassets.Bundle('scss/base.scss', "scss/fonts.scss", "scss/nav.scss",
    "scss/dialogs.scss", "scss/community.scss", "scss/cards.scss",
    "scss/feed.scss", "scss/expression.scss", "scss/settings.scss",
    "scss/signup_flow.scss", "scss/chart.scss", "scss/jplayer.scss",
    filters=scss_filter,
    output='scss.css',
    debug=False)
edit_scss = webassets.Bundle('scss/edit.scss', filters=scss_filter, output='edit.css', debug=False)
minimal_scss = webassets.Bundle('scss/minimal.scss', filters=scss_filter, output='minimal.css', debug=False)

assets_env.register('app.css', scss, filters='yui_css', output='../lib/app.css')
assets_env.register('edit.css', edit_scss, filters='yui_css', output='../lib/edit.css')
assets_env.register('minimal.css', minimal_scss, filters='yui_css', output='../lib/minimal.css')
assets_env.register('expression.js', 'expression.js', filters='yui_js', output='../lib/expression.js')

if config.debug_mode:
    assets_env.debug = True
    assets_env.url = '/lib/libsrc'
else:
    assets_env.auto_build = False
    cmd = webassets.script.CommandLineEnvironment(assets_env, logger)
    logger.info("Forcing rebuild of webassets"); t0 = time.time()
    cmd.build()
    logger.info("Assets build complete in %s seconds", time.time() - t0)

# add the assets we just compiled, and some other misc. assets, push to s3
print('Syncing all assets to s3...')
hive_assets.find(recurse=False).find('doc')
hive_assets.push_s3()


##############################################################################
#                                jinja setup                                 #
##############################################################################
jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(join(config.src_home, 'templates')))
jinja_env.trim_blocks = True
jinja_env.filters.update({
     'time': friendly_date
    ,'epoch_to_string': epoch_to_string
    ,'length_bucket': length_bucket
    ,'large_number': large_number
    ,'json': json.dumps
    ,'mod': lambda x, y: x % y
    ,'querystring': querystring
    ,'percentage': lambda x: x*100
    ,'strip_filenames': lambda name: re.sub(r'^(/var/www/newhive/|/usr/local/lib/python[\d.]*/dist-packages/)', '', name)
    #,'asset_url': assets.url
})
jinja_env.globals['colors'] = newhive.colors.colors

db = newhive.state.Database(config)
controllers = {
      'community':   CommunityController(jinja_env, assets_env, db)
    , 'analytics':   AnalyticsController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'admin':       AdminController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'user':        UserController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'file':        FileController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'expression':  ExpressionController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'mail':        MailController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'star':        StarController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'broadcast':   BroadcastController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    , 'cron':        CronController(jinja_env = jinja_env, assets_env = assets_env, db = db)
    }
app = ApplicationController(jinja_env = jinja_env, assets_env = assets_env, db = db)

def admins(server):
    def access_controled(request, response, *arg):
        if request.requester.get('name') not in config.admins:
            return app.serve_404(request, response, *arg)
        elif not request.is_secure:
            return app.redirect(response, abs_url(secure=True) + request.path + '?' + request.query_string)
        else:
            return server(request, response, *arg)
    return access_controled

def dialog_map(request, response, args=None):
    return dialogs.get(request.form['dialog'])(request, response, args)


# Possible values for the POST variable 'action'
actions = dict(
     login             = controllers['user'].login
    ,logout            = controllers['user'].logout
    ,expr_save         = controllers['expression'].save
    ,expr_delete       = controllers['expression'].delete
    ,file_create       = controllers['file'].create
    ,file_delete       = controllers['file'].delete
    ,user_create       = controllers['user'].create
    ,user_update       = controllers['user'].update
    ,password_recovery = controllers['user'].password_recovery
    ,mail_us           = controllers['mail'].mail_us
    ,mail_them         = controllers['mail'].mail_them
    ,mail_referral     = controllers['mail'].mail_referral
    ,mail_feedback     = controllers['mail'].mail_feedback
    ,user_tag_add      = controllers['user'].tag_update
    ,user_tag_remove   = controllers['user'].tag_update
    ,tag_remove        = controllers['expression'].tag_update
    ,tag_add           = controllers['expression'].tag_update
    ,admin_update      = controllers['admin'].admin_update
    ,add_referral      = controllers['admin'].add_referral
    ,add_comment       = controllers['expression'].add_comment
    ,bulk_invite       = controllers['admin'].bulk_invite
    ,profile_thumb_set = controllers['user'].profile_thumb_set
    ,star              = controllers['star'].star
    ,unstar            = controllers['star'].star
    ,broadcast         = controllers['broadcast'].update
    ,log               = controllers['user'].log
    ,thumbnail_relink  = controllers['admin'].thumbnail_relink
    ,facebook_invite   = controllers['user'].facebook_invite
    ,facebook_listen   = controllers['user'].facebook_listen
    ,dialog            = dialog_map
)

site_pages = {
     ''                    : controllers['community'].index
    ,'home'                : controllers['community'].index
    ,'search'              : controllers['community'].index
    ,'tag'                 : controllers['community'].tag
    ,'edit'                : controllers['expression'].edit
    ,'random'              : controllers['expression'].random
    ,'settings'            : controllers['user'].edit
    ,'signup'              : controllers['user'].invited # old invites in the wild may go here
    ,'invited'             : controllers['user'].invited
    ,'create_account'      : controllers['user'].new
    ,'user_check'          : controllers['user'].user_check
    ,'email_confirmation'  : controllers['user'].confirm_email
    ,'fbcanvas'            : controllers['user'].facebook_canvas
    ,'feedback'            : app.page('pages/feedback.html')
    ,'file'                : app.serve_404
    ,'cron'                : controllers['cron'].cron
    ,'admin_home'          : admins(controllers['admin'].home)
    ,'admin'               : admins(controllers['admin'].default)
    ,'analytics'           : admins(controllers['analytics'].default)
    ,'robots.txt'          : app.robots
    ,'500'                 : newhive.utils.exception_test
}

dialogs = dict(
    facebook_listen = controllers['user'].facebook_listen
)


def handle(request): # HANDLER
    """The HTTP handler, main entry point from Werkzeug.
       All POST requests must be sent to thenewhive.com, as opposed to
       user.thenewhive.com which can contain arbitrary scripts. Any
       response for thenewhive.com must not contain unsanitized user content.
       Accepts werkzeug.Request, returns werkzeug.Response"""

    request, response = app.pre_process(request)
    request.owner = None
    request.is_owner = False
    parts = request.path_parts = request.path.split('/')

    ##############################################################################
    #                                post handler                                #
    ##############################################################################
    if request.domain != config.content_domain and request.method == "POST":
        reqaction = request.form.get('action')
        if reqaction:
            insecure_actions = ['add_comment', 'star', 'unstar', 'broadcast', 'log', 'mail_us', 'tag_add', 'mail_referral', 'password_recovery', 'mail_feedback', 'facebook_invite', 'dialog', 'profile_thumb_set', 'user_tag_add', 'user_tag_remove']
            non_logged_in_actions = ['login', 'log', 'user_create', 'mail_us', 'password_recovery', 'mail_feedback', 'file_create']
            if not reqaction in insecure_actions:
                if not request.is_secure: raise exceptions.BadRequest('post request action "' + reqaction + '" is not secure')
                # erroneously catches logout, possibly other posts
                #if urlparse(request.headers.get('Referer')).hostname != config.server_name:
                #    raise exceptions.BadRequest('Invalid cross site post request from: ' + request.headers.get('Referer'))
            if not request.requester.logged_in and not reqaction in non_logged_in_actions:
                raise exceptions.BadRequest('post request action "' + reqaction + '" is not logged_in')

            if not actions.get(reqaction): raise exceptions.BadRequest('invalid action: '+reqaction)
            r = actions.get(reqaction)(request, response)
            if type(r) == Response: return r
            if r != None: return app.serve_json(response, r, as_text = True)
            elif reqaction != 'logout':
               print reqaction
               print "************************would return status 204 here*************************"
               #return Response(status=204) # 204 status = no content

    ##############################################################################
    #                             site_url handler                               #
    ##############################################################################
    if request.domain == config.server_name:
        return site_pages.get(parts[0], app.serve_404)(request, response)
    elif request.domain.startswith('www.'):
        return app.redirect(response, re.sub('www.', '', request.url, 1))

    ##############################################################################
    #                             user_url handler                               #
    ##############################################################################
    request.owner = owner = db.User.find(dict(sites=request.domain.lower()))
    if not owner: return app.serve_404(request, response)
    request.is_owner = request.requester.logged_in and owner.id == request.requester.id

    response.context.update(
         domain = request.domain
        ,owner = owner
        ,owner_url = owner.url
        ,path = request.path
        ,user_is_owner = request.is_owner
        ,listeners = owner.starrer_page()
        )

    if parts[0] == 'profile': return controllers['community'].index(request, response)
    if parts[0] == 'expressions': return app.redirect(response, owner.url)
    if config.debug_mode and request.path == 'robots.txt': return app.robots(request, response)
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
    try:
        return handle(request)
    except Exception as e:
        import socket
        from werkzeug.debug.tbtools import get_current_traceback
        hostname = socket.gethostname()
        traceback = get_current_traceback(skip=1, show_hidden_frames=False, ignore_system_exceptions=True)
        requester = request.environ['hive.request'].requester
        def serializable_filter(dictionary):
            return {key.replace('.', '-'): val for key, val in dictionary.iteritems() if type(val) in [bool, str, int, float, tuple, unicode]}
        def privacy_filter(dictionary):
            for key in ['password', 'secret', 'old_password']:
                if dictionary.has_key(key): dictionary.update({key: "******"})
            return dictionary
        log_entry = {
                'exception': traceback.exception
                , 'environ': serializable_filter(request.environ)
                , 'form': privacy_filter(serializable_filter(request.form))
                , 'url': request.url
                , 'stack_frames': [
                        {
                        'filename': x.filename,
                        'lineno': x.lineno,
                        'function_name': x.function_name,
                        'current_line': x.current_line.strip()
                        } for x in traceback.frames
                    ]
                , 'requester': {'id': requester.id, 'name': requester.get('name')}
                , 'code_revision': newhive.manage.git.current_revision
                }

        db.ErrorLog.create(log_entry)
        raise

application = handle_safe
#application = handle_debug
logger.info("WSGI initialization complete")

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
