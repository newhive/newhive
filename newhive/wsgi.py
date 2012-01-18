#!/usr/bin/env python
# Copyright 2011, Abram Clark & A Reflection Of LLC
# thenewhive.com WSGI server version 0.2

from newhive.controllers.shared import *
from newhive.controllers.analytics import AnalyticsController
from newhive.controllers.admin import AdminController
from newhive.controllers.expression import ExpressionController
from newhive.controllers.application import ApplicationController
from newhive.controllers.mail import MailController

import os, re, json, mimetypes, math, time, crypt, urllib, base64
from datetime import datetime
from os.path  import dirname, exists, join as joinpath
from werkzeug import Request, Response, exceptions, url_unquote
from urlparse import urlparse
import jinja2

from newhive import config, auth
from newhive import colors
from newhive.state import Expr, File, User, Contact, Referral, DuplicateKeyError, time_u, normalize, get_root, abs_url, Comment, Star, ActionLog, db, junkstr
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
    , 'expression':    ExpressionController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
    , 'mail':     MailController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
    }

application_controller = ApplicationController(jinja_env = jinja_env, assets_env = assets_env, db = newhive.state)
serve_page = application_controller.serve_page
serve_404 = application_controller.serve_404
serve_json = application_controller.serve_json
#serve_html = application_controller.serve_html
#serve_page = application_controller.serve_page
expr_list = controllers['expression']._expr_list
expr_home_list = controllers['expression']._expr_home_list

def files_create(request, response):
    """ Saves a file uploaded from the expression editor, responds
    with a Hive.App JSON object.
    Resamples images to 1600x1000 or smaller, sets JPEG quality to 70
    """

    request.max_content_length = 100000000

    # TODO: separate image optimization from file upload logic
    for file_name in request.files:
        file = request.files[file_name]
        mime = mimetypes.guess_type(file.filename)[0]

        app = {}
        if mime == 'text/plain':
            app['type'] = 'hive.text'
            app['content'] = file.stream.read()
            return app

        tmp_file = os.tmpfile()
        file.save(tmp_file)
        res = File.create(owner=request.requester.id, tmp_file=tmp_file, name=file.filename, mime=mime)
        tmp_file.close()
        url = res.get('url')
        app['file_id'] = res.id

        if mime in ['image/jpeg', 'image/png', 'image/gif']:
            app['type'] = 'hive.image'
            app['content'] = url
        elif mime == 'audio/mpeg':
            app['content'] = ("<object type='application/x-shockwave-flash' data='/lib/player.swf' width='100%' height='24'>"
                +"<param name='FlashVars' value='soundFile=" + url + "'>"
                +"<param name='wmode' value='transparent'></object>"
                )
            app['type'] = 'hive.html'
            app['dimensions'] = [200, 24]
        else:
            app['type'] = 'hive.text'
            app['content'] = "<a href='%s'>%s</a>" % (url, file.filename)

        return app

def file_delete(request, response):
    res = File.fetch(request.form.get('id'))
    if res: res.delete()
    return True


def user_check(request, response):
    return False if User.named(request.args.get('name')) else True

def user_create(request, response):
    """ Checks if the referral code matches one found in database.
        Decrements the referral count of the user who created the referral and checks if the count is > 0.
        Creates user record.
        Creates empty home expression, so user.thenewhive.com does not show 404.
        Creates media directory for user.
        emails thank you for registering to user
        Logs new user in.
        """

    referral = Referral.fetch(request.args.get('key'), keyname='key')
    if (not referral or referral.get('used')): return bad_referral(request, response)
    referrer = User.fetch(referral['user'])
    assert 'tos' in request.form

    args = dfilter(request.form, ['name', 'password', 'email', 'fullname'])
    args.update({
         'referrer' : referral['user']
        ,'sites'    : [args['name'].lower() + '.' + config.server_name]
        #,'flags'    : { 'add_invites_on_save' : True }
    })
    user = User.create(**args)
    referrer.update(referrals = referrer['referrals'] - 1)
    referral.update(used=True, user_created=user.id, user_created_name=user['name'], user_created_date=user['created'])
    home_expr = user.expr_create({ 'title' : 'Homepage', 'home' : True })
    user.give_invites(5)

    try: mail_user_register_thankyou(user)
    except: pass # TODO: log an error

    request.form = dict(username = args['name'], secret = args['password'])
    login(request, response)
    return redirect(response, abs_url(subdomain=config.site_user) + config.site_pages['welcome'])

def no_more_referrals(referrer, request, response):
    response.context['content'] = 'User %s has no more referrals' % referrer
    return serve_page(response, 'pages/minimal.html')
def bad_referral(request, response):
    response.context['msg'] = 'You have already signed up. If you think this is a mistake, please try signing up again, or contact us at <a href="mailto:info@thenewhive.com">info@thenewhive.com</a>'
    response.context['error'] = 'Log in if you already have an account'
    return serve_page(response, 'pages/error.html')

def profile_thumb_set(request, response):
    request.max_content_length = 10000000 # 10 megs
    file = request.files.get('profile_thumb')
    mime = mimetypes.guess_type(file.filename)[0]
    if not mime in ['image/jpeg', 'image/png', 'image/gif']:
        response.context['error'] = "File must be either JPEG, PNG or GIF and be less than 10 MB"

    tmp_file = os.tmpfile()
    file.save(tmp_file)
    res = File.create(owner=request.requester.id, tmp_file=tmp_file, name=file.filename, mime=mime)
    tmp_file.close()
    request.requester.update(thumb_file_id = res.id, profile_thumb=res.get_thumb(190,190))
    return redirect(response, request.form['forward'])


def expr_tag_update(request, response):
    tag = lget(normalize(request.form.get('value', '')), 0)
    id = request.form.get('expr_id')
    expr = Expr.fetch(id)
    if request.requester.id != expr.owner.id and not tag == "starred": return False
    action = request.form.get('action')
    if action == 'tag_add':
        if tag == "starred":
            s = Star.new(request.requester, expr)
            return True
        else:
            new_tags = expr.get('tags', '') + ' ' + tag
    elif action == 'tag_remove':
        if tag == "starred":
            s = Star.find(initiator=request.requester.id, entity=id)
            res = s.delete()
            if not res['err']: return True
            else: return res
        else:
            new_tags = re.sub(tag, '', expr['tags'])
    expr.update(tags=new_tags, updated=False)
    return tag

def user_tag_update(request, response):
    tag = lget(normalize(request.form.get('value', '')), 0)
    if not tag: return False
    if request.form.get('action') == 'user_tag_add': request.requester.update_cmd({'$addToSet':{'tags':tag}})
    else: request.requester.update_cmd({'$pull':{'tags':tag}})
    return True

def star(request, response):
    if not request.requester and request.requester.logged_in: raise exceptions.BadRequest()
    parts = request.form.get('path').split('/')
    p1 = lget(parts, 1)
    if p1 in ["expressions", "starred", "listening"]:
        entity = User.find(sites=request.domain.lower())
    else:
        entity = Expr.named(request.domain.lower(), request.path.lower())
    if request.form.get('action') == "star":
        s = Star.new(request.requester, entity)
        if s or s.get('entity'):
          return 'starred'
        else:
          return False
    else:
       s = Star.find(initiator=request.requester.id, entity=entity.id)
       if s:
           res = s.delete()
           if not res['err']: return 'unstarred'
       else:
           return 'unstarred'

def admin_update(request, response):
    if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
    for k in ['tags', 'tagged']:
        v = json.loads(request.form.get(k))
        if v: get_root().update(**{ k : v })

def bulk_invite(request, resposne):
    if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
    form = request.form.copy()
    for key in form:
        parts = key.split('_')
        if parts[0] == 'check':
            id = parts[1]
            contact = Contact.fetch(id)
            name = form.get('name_' + id)
            if contact.get('email'):
                referral_id = mail_invite(contact['email'], name)
                if referral_id:
                    contact.update(referral_id=referral_id)
                else:
                    print "email not sent to " + contact['email'] + " referral already exists"

def add_referral(request, response):
    if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
    form = request.form.copy()
    action = form.pop('action')
    number = int(form.pop('number'))
    forward = form.pop('forward')
    if form.get('all'):
        users = User.search();
    else:
        users = []
        for key in form:
            users.append(User.fetch(key))

    for user in users: user.give_invites(number)

    return redirect(response, forward)

def add_comment(request, response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'x-requested-with')
    commenter = request.requester
    expression = Expr.fetch(request.form.get('expression'))
    comment_text = request.form.get('comment')
    comment = Comment.new(commenter, expression, {'text': comment_text})
    if comment.initiator.id != expression.owner.id:
      mail_feed(comment, expression.owner)
    return serve_html(response, jinja_env.get_template("partials/comment.html").render({'comment': comment}))

def home_url(user, path='expressions'):
    """ Returns default URL for given state.User """
    return abs_url(domain = user.get('sites', [config.server_name])[0]) + path
def login(request, response):
    if auth.handle_login(request, response):
        return redirect(response, request.form.get('url', home_url(request.requester)))

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

def thumbnail_relink(request, response):
    expr = Expr.fetch(request.form.get('expr'))
    file = File.fetch(request.form.get('file'))
    if expr and file:
        expr.update(thumb_file_id=file.id, updated=False)
        return {'file': file.id, 'expr': expr.id}
    else: return False

def user_update(request, response):
    message = ''
    user = request.requester
    if not user.cmp_password(request.form.get('old_password')): return serve_json(response, {'success': False, 'message': ui.password_change_failure_message})
    if request.form.get('password'):
        if auth.password_change(request, response):
            message = message + ui.password_change_success_message + " "
        else:
            return serve_json(response, {'success': False, 'message': ui.password_change_failure_message})
    fullname = request.form.get('fullname')
    if fullname and fullname != request.requester.get('fullname'):
        user.update(fullname=fullname)
        message = message + ui.fullname_change_success_message + " "
    email = request.form.get('email')
    if email and email != request.requester.get('email'):
        user.update(email_confirmation_request_date=time.time())
        mail_email_confirmation(user, email)
        message = message + ui.email_change_success_message + " "
    return serve_json(response, {'success': True, 'message': message})

def password_recovery(request, response):
    email = request.form.get('email')
    name = request.form.get('name')
    user = User.find(email=email, name=name)
    if user:
        mail_temporary_password(user)
        return serve_json(response, {'success': True, 'message': ui.password_recovery_success_message})
    else:
        return serve_json(response, {'success': False, 'message': ui.password_recovery_failure_message})


# Possible values for the POST variable 'action'
actions = dict(
     login           = login
    ,logout          = auth.handle_logout
    ,expr_save       = controllers['expression'].save
    ,expr_delete     = controllers['expression'].delete
    ,files_create    = files_create
    ,file_delete     = file_delete
    ,user_create     = user_create
    ,user_update     = user_update
    ,password_recovery = password_recovery
    ,mail_us         = controllers['mail'].mail_us
    ,mail_them       = controllers['mail'].mail_them
    ,mail_referral   = controllers['mail'].mail_referral
    ,mail_feedback   = controllers['mail'].mail_feedback
    ,user_tag_add    = user_tag_update
    ,user_tag_remove = user_tag_update
    ,tag_remove      = expr_tag_update
    ,tag_add         = expr_tag_update
    ,admin_update    = admin_update
    ,add_referral    = add_referral
    ,add_comment     = add_comment
    ,bulk_invite     = bulk_invite
    ,profile_thumb_set  = profile_thumb_set
    ,star            = star
    ,unstar          = star
    ,log             = log
    ,thumbnail_relink= thumbnail_relink
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
        if p1 == 'file':
            res = File.fetch(p2)
            if not res: return serve_404(request, response)
            #if response.enforce_static and unsafe_mimes.get(resource['mime'], False):
            #    raise DangerousContent()
            response.content_type = res['mime']
            response.headers.add('Content-Disposition', 'inline', filename=res['name'])
            with open(res['fs_path']) as f: response.data = f.read()
            return response
        elif p1 == 'edit' and request.requester.logged_in:
            return controllers['expression'].default(request, response, {'method': 'edit'})
        elif p1 == 'signup':
            response.context['action'] = 'create'
            referral = Referral.fetch(request.args.get('key'), keyname='key')
            if not referral or referral.get('used'): return bad_referral(request, response)
            return serve_page(response, 'pages/user_settings.html')
        elif p1 == 'settings':
            if request.requester.logged_in and request.is_secure:
                response.context['action'] = 'update'
                response.context['f'] = request.requester
                return serve_page(response, 'pages/user_settings.html')
        elif p1 == 'referral' and request.requester.logged_in:
            if(request.requester['referrals'] <= 0):
                return no_more_referrals(request.requester['name'], request, response)
            res = Referral.create(user = request.requester.id)
            response.context['content'] = abs_url(secure=True) + 'signup?key=' + res['key']
            return serve_page(response, 'pages/minimal.html')
        elif p1 == 'feedback': return serve_page(response, 'pages/feedback.html')
        elif p1 == 'email_confirmation':
            user = User.fetch(request.args.get('user'))
            email = request.args.get('email')
            if not user:
                response.context.update({'err': 'user record does not exist'})
            if not request.args.get('secret') == crypt.crypt(email, "$6$" + str(int(user.get('email_confirmation_request_date')))):
                response.context.update({'err': 'secret does not match email'})
            else:
                user.flag('confirmed_email')
                user.update(email=email)
                response.context.update({'user': user, 'email': email})
            return serve_page(response, "pages/email_confirmation.html")
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
        elif p1 == 'admin': # and request.requester.get('name') in config.admins:
            return controllers['admin'].default(request, response, {'method': p2})
        elif p1 == 'analytics': #and request.requester.get('name') in config.admins:
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
        elif p1 == 'user_check': return serve_json(response, user_check(request, response))
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
        ,owner_url = home_url(owner)
        ,path = request.path
        ,user_is_owner = is_owner
        ,create_expr_card = re.match('expressions', request.path) and is_owner
        )

    if request.path.startswith('expressions') or request.path == 'starred':
        return controllers['expression'].index(request, response)
    if request.path in ['listening', 'feed']:
        if request.path == 'listening':
            tag = people_tag
            response.context['users'] = User.list({'_id': {'$in': owner.starred_items}})
        elif request.path == 'feed':
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

    if request.args.has_key('dialog'):
        dialog = request.args['dialog']
        response.context.update(exp=resource, expr=resource)
        return serve_page(response, 'dialogs/' + dialog + '.html')


    if lget(request.path, 0) == '*':
        return redirect(response, home_url(owner) +
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

