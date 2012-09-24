#!/usr/bin/env python
# Copyright 2011, Abram Clark & A Reflection Of LLC
# thenewhive.com WSGI server version 0.2

from newhive.controllers.shared import *
from newhive import controllers as hivectrl
import os, re, mimetypes, math, time, crypt, urllib, base64
import datetime
from os.path  import join
from werkzeug import Request, Response, exceptions, url_unquote
from werkzeug.routing import Map, Rule
from werkzeug.exceptions import HTTPException, NotFound
from urlparse import urlparse
import jinja2

from newhive import config, utils
from newhive.utils import abs_url, now
from newhive.assets import HiveAssets
from newhive.extra_json import extra_json
import newhive.colors
import newhive.state
import newhive.manage.git
import newhive.assets

import logging
logger = logging.getLogger(__name__)
logger.info("Initializing WSGI")


hive_assets = HiveAssets()
hive_assets.bundle()

##############################################################################
#                                jinja setup                                 #
##############################################################################
jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(join(config.src_home, 'templates')))
jinja_env.trim_blocks = True

jinja_env.filters.update({
     'time': friendly_date
    ,'epoch_to_string': epoch_to_string
    ,'length_bucket': length_bucket
    ,'number': lambda n: '{:,}'.format(n)       # adds ',' thousands separator
    ,'large_number': large_number
    ,'no_zero': no_zero
    ,'json': extra_json
    ,'mod': lambda x, y: x % y
    ,'querystring': querystring
    ,'percentage': lambda x: x*100
    ,'strip_filenames':
        lambda name: re.sub(r'^(/var/www/newhive/|/usr/local/lib/python[\d.]*/dist-packages/)', '', name)
    ,'asset_url': hive_assets.url
    ,'urlencode': lambda s: urllib.quote(s.encode('utf8'))
    ,'clean_url': lambda s: re.match('https?://([^?]*)', s).groups()[0]
    ,'html_breaks': lambda s: re.sub('\n', '<br/>', str(s))
    ,'modify_query': utils.modify_query
})
jinja_env.globals.update({
     'colors': newhive.colors.colors
    ,'asset_bundle': hive_assets.asset_bundle
})

##############################################################################
#                          newhive server setup                              #
##############################################################################
db = newhive.state.Database(config, assets=hive_assets)
server_env = {
     'db': db
    ,'jinja_env': jinja_env
    ,'assets': hive_assets
}

controllers = {
      'expression':  hivectrl.Expression(**server_env)
    , 'feed':        hivectrl.Feed(**server_env)
    , 'file':        hivectrl.File(**server_env)
    , 'user':        hivectrl.User(**server_env)
    , 'community':   hivectrl.Community(**server_env)
    , 'mail':        hivectrl.Mail(**server_env)
    , 'cron':        hivectrl.Cron(**server_env)
    , 'analytics':   hivectrl.Analytics(**server_env)
    , 'admin':       hivectrl.Admin(**server_env)
    }
app = hivectrl.Application(**server_env)

def dialog_map(request, response, args=None):
    return dialogs.get(request.form['dialog'])(request, response, args)


# Possible values for the POST variable 'action'
actions = dict(
     expr_save         = controllers['expression'].save
    ,expr_delete       = controllers['expression'].delete
    ,tag_remove        = controllers['expression'].tag_update
    ,tag_add           = controllers['expression'].tag_update
    ,star              = controllers['feed'].star
    ,broadcast         = controllers['feed'].broadcast
    ,comment           = controllers['feed'].comment
    ,file_create       = controllers['file'].create
    ,file_delete       = controllers['file'].delete
    ,login             = controllers['user'].login
    ,logout            = controllers['user'].logout
    ,user_create       = controllers['user'].create
    ,user_update       = controllers['user'].update
    ,password_recovery_1 = controllers['user'].password_recovery_1
    ,password_recovery_2 = controllers['user'].password_recovery_2
    ,user_tag_add      = controllers['user'].tag_update
    ,user_tag_remove   = controllers['user'].tag_update
    ,profile_thumb_set = controllers['user'].profile_thumb_set
    ,log               = controllers['user'].log
    ,facebook_invite   = controllers['user'].facebook_invite
    ,facebook_listen   = controllers['user'].facebook_listen
    ,signup_request    = controllers['mail'].signup_request
    ,share_expr        = controllers['mail'].share_expr
    ,user_referral     = controllers['mail'].user_referral
    ,mail_feedback     = controllers['mail'].mail_feedback
    ,admin_update      = controllers['admin'].admin_update
    ,add_referral      = controllers['admin'].add_referral
    ,bulk_invite       = controllers['admin'].bulk_invite
    ,thumbnail_relink  = controllers['admin'].thumbnail_relink
    ,dialog            = dialog_map
    ,add_to_featured   = controllers['admin'].add_to_featured
    ,update_featured   = controllers['admin'].update_featured
    ,unsubscribe       = controllers['user'].unsubscribe
)

site_pages = {
     ''                    : controllers['community'].index
    ,'home'                : controllers['community'].index
    ,'search'              : controllers['community'].index
    ,'tag'                 : controllers['community'].tag
    ,'random'              : controllers['expression'].random
    ,'expr_info'           : controllers['expression'].info
    ,'expr_feed'           : controllers['expression'].feed
    ,'edit'                : controllers['expression'].edit_frame
    ,'user'                : controllers['user'].info
    ,'settings'            : controllers['user'].edit
    ,'password_recovery'   : controllers['user'].edit
    ,'signup'              : controllers['user'].invited # old invites in the wild may go here
    ,'invited'             : controllers['user'].invited
    ,'create_account'      : controllers['user'].new
    ,'user_check'          : controllers['user'].user_check
    ,'email_confirmation'  : controllers['user'].confirm_email
    ,'fbcanvas'            : controllers['user'].facebook_canvas
    ,'unsubscribe'         : controllers['user'].unsubscribe_form
    ,'feedback'            : app.page('pages/feedback.html')
    ,'file'                : app.serve_404
    ,'cron'                : controllers['cron'].cron
    ,'admin_home'          : controllers['admin'].home
    ,'admin'               : controllers['admin'].default
    ,'analytics'           : controllers['analytics'].default
    ,'robots.txt'          : app.robots
    ,'error_log.js'        : controllers['analytics'].js_error_log
    ,'500'                 : newhive.utils.exception_test
}

dialogs = dict(
    facebook_listen = controllers['user'].facebook_listen
)


def handle(request): # HANDLER
    """The HTTP handler, main entry point from Werkzeug. """

    request, response = app.pre_process(request)
    request.owner = None
    request.is_owner = False
    parts = request.path_parts = request.path.split('/')


    ##############################################################################
    #      user content handler end editor, serves UNSAFE sandboxed content      #
    ##############################################################################
    if request.domain == config.content_domain:
        if parts[0] == 'edit': return controllers['expression'].edit(request, response)
        elif parts[0] == 'empty': return controllers['expression'].empty(request, response)
        return controllers['expression'].render(request, response)


    ##############################################################################
    #                          post action handler                               #
    ##############################################################################
    reqaction = request.form.get('action')
    if reqaction:
        # these can be performed over non-ssl connections
        insecure_actions = [
            'comment', 'star', 'broadcast', 'log', 'signup_request', 'tag_add', 'share_expr'
            , 'user_referral', 'password_recovery_1', 'mail_feedback', 'facebook_invite'
            , 'dialog', 'profile_thumb_set', 'user_tag_add', 'user_tag_remove']
        non_logged_in_actions = ['login', 'log', 'user_create', 'signup_request', 'password_recovery_1'
            , 'password_recovery_2', 'mail_feedback', 'file_create', 'unsubscribe']
        if ( (reqaction in insecure_actions or request.is_secure) and
             (reqaction in non_logged_in_actions or request.requester.logged_in)
        ):
            if not actions.get(reqaction): raise exceptions.BadRequest('invalid action: '+reqaction)
            r = actions.get(reqaction)(request, response)
            if type(r) == Response: return r
            if r != None: return app.serve_json(response, r, as_text = True)
        else:
            return app.serve_forbidden(request)

        logger.warn('falling through post handler on action "%s"', reqaction)
        #return Response(status=204) # 204 status = no content


    username = None
    ##############################################################################
    #                          site and user url handler                         #
    ##############################################################################
    if request.domain == config.server_name:
        if site_pages.has_key(parts[0]):
            return site_pages.get(parts[0], app.serve_404)(request, response)
        else:
            username = parts[0] # assume newhive.com/username/
            parts = request.path_parts = parts[1:]
            if not len(parts): parts = ['']
    # handle redirection
    else:
        if request.domain.startswith('www.'):
            return app.redirect(response, re.sub('www.', '', request.url, 1), permanent=True)

        for redirect_from in config.redirect_domains:
            if request.domain == redirect_from or request.domain.endswith('.' + redirect_from):
                name = request.domain[0:-len(redirect_from)].strip('.')
                new_url = abs_url() + name + ('/' if name else '') + request.path
                if request.query_string: new_url += '?' + request.query_string
                return app.redirect(response, new_url, permanent=True)


    ##############################################################################
    #                             user url handler                               #
    ##############################################################################
    request.owner = owner = ( db.User.named(username) if username else
        db.User.find({ 'sites': request.domain.lower() }) )
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
    return controllers['expression'].frame(request, response, parts)


##############################################################################
#                       werkzeug / mod_wsgi entry point                      #
##############################################################################
@Request.application
def handle_debug(request):
    """Allow exceptions to be handled by werkzeug for debugging"""
    return handle(request)

@Request.application
def handle_safe(request):
    """Log thrown exceptions"""
    # TODO: display friendly error message.
    try:
        return handle(request)
    except Exception as e:
        from werkzeug.debug.tbtools import get_current_traceback
        traceback = get_current_traceback(skip=1, show_hidden_frames=False
                , ignore_system_exceptions=True)
        def privacy_filter(dictionary):
            for key in ['password', 'secret', 'old_password']:
                if dictionary.has_key(key): dictionary.update({key: "******"})
            return dictionary
        log_entry = {
                'type': 'python'
                , 'exception': traceback.exception
                , 'environ': utils.serializable_filter(request.environ)
                , 'form': privacy_filter(utils.serializable_filter(request.form))
                , 'url': request.url
                , 'stack_frames': [
                        {
                        'filename': x.filename,
                        'lineno': x.lineno,
                        'function_name': x.function_name,
                        'current_line': x.current_line.strip()
                        } for x in traceback.frames
                    ]
                , 'code_revision': newhive.manage.git.current_revision
                , 'dev_prefix': config.dev_prefix
                }
        request = request.environ.get('hive.request')
        if request and hasattr(request, 'requester'):
            log_entry.update({'requester': {'id': request.requester.id
                                            , 'name': request.requester.get('name')}})

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
    config.interactive = True

    cara = db.User.named('cara')
    duffy = db.User.named('duffy')
    andrew = db.User.named('andrew')
    abram = db.User.named('abram')
    zach = db.User.named('zach')
