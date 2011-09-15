#!/usr/bin/env python
# Copyright 2011, Abram Clark & A Reflection Of LLC
# thenewhive.com WSGI server version 0.2

import os, re, json, mimetypes
from datetime import datetime
from os.path  import dirname, exists, join as joinpath
from werkzeug import Request, Response, exceptions, url_unquote
import jinja2
import PIL.Image as Img

import config, auth
from colors import colors
from state import Expr, File, User, Contact, junkstr, create, fetch, DuplicateKeyError, time_u, normalize, get_root


def lget(L, i, default=None):
    try: return L[i]
    except: return default
def raises(e): raise e
def dfilter(d, keys):
    """ Accepts dictionary and list of keys, returns a new dictionary
        with only the keys given """
    r = {}
    for k in keys:
        if k in d: r[k] = d[k]
    return r


def expr_save(request, response):
    """ Parses JSON object from POST variable 'exp' and stores it in database.
        If the name (url) does not match record in database, create a new record."""

    if not request.trusting: raise exceptions.BadRequest()
    try: exp = Expr(json.loads(request.form.get('exp', '0')))
    except: exp = False
    if not exp: raise ValueError('missing or malformed exp')

    res = Expr.fetch(exp.id)
    upd = dfilter(exp, ['name', 'domain', 'title', 'apps', 'dimensions', 'auth', 'password', 'tags', 'background'])
    upd['name'] = upd['name'].lower().strip()
    if re.search('\#|\?|\!', upd['name']) or re.match('^\*', upd['name']):
        return dict(error="Sorry, the URL may not contain '#', '?', or begin with '*'.")
    generate_thumb(upd, request.requester)
    if not exp.id or upd['name'] != res['name'] or upd['domain'] != res['domain']:
        try: res = request.requester.expr_create(upd)
        except DuplicateKeyError: return dict( error='An expression already exists with the URL: ' + upd['name'])
    else:
        if not res['owner'] == request.requester.id:
            raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
        res.update(**upd)
    return dict( error=False, location=abs_url(domain = upd['domain']) + upd['name'] )

import urllib, random
def generate_thumb(expr, owner):
    # TODO: don't regenerate thumb when image has not changed

    # retrieve first image from expression
    fst_img = lget(filter(lambda a: a['type'] == 'hive.image', expr.get('apps', [])), -1)
    if not fst_img or not fst_img.get('content'): return

    # create file record in database, copy file to media directory via http
    try: response = urllib.urlopen(fst_img['content'])
    except: return
    if response.getcode() != 200: return
    res = File.create(
         owner = owner.id
        ,name = 'thumb'
        ,mime = response.headers.getheader('Content-Type')
        )
    path = media_path(owner, res.id)
    f = open(path, 'w')
    f.write(response.read())
    f.close()
    res.update(fs_path = path)

    # resize and crop image to 124x96, preserving aspect ratio, save over original
    try: imo = Img.open(path)
    except:
        res.delete()
        return
    ratio = float(imo.size[0]) / imo.size[1]
    ratio_target = 124.0 / 96
    new_size = (124, int(124 / ratio)) if ratio < ratio_target else (int(96 * ratio), 96)
    imo = imo.resize(new_size, resample=Img.ANTIALIAS)
    imo = imo.crop((0, 0, 124, 96))
    imo = imo.convert(mode='RGB')
    imo.save(path, format='jpeg')

    url = abs_url() + 'file/' + res.id
    expr['thumb'] = url


def expr_delete(request, response):
    if not request.trusting: raise exceptions.BadRequest()
    e = Expr.fetch(request.form.get('id'))
    if not e: return serve_404(request, response)
    if e['owner'] != request.requester.id: raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
    e.delete()
    if e['name'] == '': request.requester.expr_create({})
    # TODO: garbage collect media files that are no longer referenced by expression
    return redirect(response, home_url(request.requester))

def save_file(file_or_name):
    """ Uploads file to s3 if config.aws_id is defined, otherwise
    saves in config.media_path
    """

    path = media_path(request.requester, res.id)

def media_path(user, f_id=None):
    p = joinpath(config.domain_home, config.server_name, user['name'], 'media')
    return joinpath(p, f_id) if p else p
def files_create(request, response):
    """ Saves a file uploaded from the expression editor, responds
    with a Hive.App JSON object Resamples images to 1600x1000 or
    smaller, sets JPEG quality to 70
    """

    if not request.trusting: raise exceptions.BadRequest()
    request.max_content_length = 100000000

    for file_name in request.files:
        file = request.files[file_name]
        mime = mimetypes.guess_type(file.filename)[0]

        #if exists(joinpath(media_path(request.requester), file.filename)):
        #    m = re.search('(.*?)(_([0-9]+))?(\..*?$)', file.filename)
        #    if m.groups()[2]: file.filename = m.groups()[0] + '_' + str(int(m.groups()[2]) + 1) + m.groups()[3]
        #    else: file.filename = m.groups()[0] + '_1' + m.groups()[3]
        #path = joinpath(media_path(request.requester), file.filename)

        app = {}
        if mime == 'text/plain':
            app['type'] = 'hive.text'
            app['content'] = file.stream.read()
        else:
            res = File.create(
                 owner = request.requester.id
                ,name = file.filename
                ,mime = mime
                )
            file.save(path)
            res.update(fs_path = path)
            url =  abs_url() + 'file/' + res.id

            if mime in ['image/jpeg', 'image/png', 'image/gif']:
                app['type'] = 'hive.image'
                app['content'] = url

                try: imo = Img.open(path)
                except:
                    res.delete()
                    return False
                if imo.size[0] > 1600 or imo.size[1] > 1000:
                    ratio = float(imo.size[0]) / imo.size[1]
                    new_size = (1600, int(1600 / ratio)) if ratio > 1.6 else (int(1000 * ratio), 1000)
                    imo = imo.resize(new_size, resample=Img.ANTIALIAS)
                imo = imo.convert(mode='RGB')
                opts = {}
                if mime == 'image/jpeg': opts.update(quality = 70, format = 'JPEG')
                if mime == 'image/png': opts.update(optimize = True, format = 'PNG')
                if mime == 'image/gif': opts.update(format = 'GIF')
                imo.save(path, **opts)
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

def user_create(request, response):
    """ Checks if the referral code matches one found in database.
        Decrements the referral count of the user who created the referral and checks if the count is > 0.
        Creates user record.
        Creates empty home expression, so user.thenewhive.com does not show 404.
        Creates media directory for user.
        Logs new user in.
        """

    referral = fetch('referral', request.args.get('key'), keyname='key')
    if not referral: return bad_referral(request, response)
    referrer = User.fetch(referral['user'])
    if(referrer['referrals'] <= 0):
        return no_more_referrals(referrer['name'], request, response)
    assert 'tos' in request.form

    args = dfilter(request.form, ['name', 'password', 'email', 'fullname'])
    args['referrer'] = referral['user']
    args['sites'] = [args['name'] + '.' + config.server_name]
    user = User.create(**args)
    referrer.update(referrals = referrer['referrals'] - 1)
    referral.delete()
    user.expr_create({ 'title' : 'Homepage' })

    os.makedirs(media_path(user))

    request.form = dict(username = args['name'], secret = args['password'])
    login(request, response)
    return redirect(response, config.intro_url)

def no_more_referrals(referrer, request, response):
    response.context['content'] = 'User %s has no more referrals' % referrer
    return serve_page(response, 'minimal.html')
def bad_referral(request, response):
    response.context['content'] = 'Invalid referral; already used or never existed'
    return serve_page(response, 'minimal.html')


def expr_tag_update(request, response):
    if not request.trusting: raise exceptions.BadRequest()
    tag = lget(normalize(request.form.get('value', '')), 0)
    id = request.form.get('expr_id')
    expr = Expr.fetch(id)
    action = request.form.get('action')
    if action == 'tag_add': new_tags = expr.get('tags', '') + ' ' + tag
    elif action == 'tag_remove': new_tags = re.sub(tag, '', expr['tags'])
    expr.update(tags=new_tags, updated=False)
    return True

def user_tag_update(request, response):
    if not request.trusting: raise exceptions.BadRequest()
    tag = lget(normalize(request.form.get('value', '')), 0)
    if not tag: return False
    if request.form.get('action') == 'user_tag_add': request.requester.update_cmd({'$addToSet':{'tags':tag}})
    else: request.requester.update_cmd({'$pull':{'tags':tag}})
    return True

def admin_update(request, response):
    if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
    for k in ['tags', 'tagged']:
        v = json.loads(request.form.get(k))
        if v: get_root().update(**{ k : v })

from smtplib import SMTP
def send_mail(headers, body):
    b = "\r\n".join([k + ': ' + headers[k] for k in headers.keys()] + ['', body])
    return SMTP('localhost').sendmail(headers['From'], headers['To'].split(','), b)

def mail_us(request, response):
    if not request.form.get('message'): return False
    heads = {
         'To' : 'info@thenewhive.com'
        ,'From' : 'www-data@' + config.server_name
        ,'Subject' : '[home page contact form]'
        ,'Reply-to' : request.form.get('email')
        }
    body = request.form.get('message')
    send_mail(heads, body)
    create('contact_log', msg=body, email=request.form.get('email'))
    return True

def mail_them(request, response):
    if not request.trusting: raise exceptions.BadRequest()
    if not request.form.get('message') or not request.form.get('to'): return False
    heads = {
         'To' : request.form.get('to')
        ,'From' : 'The New Hive <noreply+share@thenewhive.com>'
        ,'Subject' : request.form.get('subject', '')
        ,'Reply-to' : request.requester.get('email', '')
        }
    body = request.form.get('message')
    send_mail(heads, body)
    if request.form.get('send_copy'):
        heads.update(To = request.requester.get('email', ''))
        send_mail(heads, body)
    return redirect(response, request.form.get('forward'))

def mail_feedback(request, response):
    if not request.form.get('message'): return serve_error(response, 'Sorry, there was a problem sending your message.')
    heads = {
         'To' : 'bugs@thenewhive.com'
        ,'From' : 'Feedback <noreply+feedback@' + config.server_name +'>'
        ,'Subject' : 'Feedback from ' + request.requester.get('name', '') + ', ' + request.requester.get('fullname', '')
        ,'Reply-to' : request.requester.get('email', '')
        }
    url = url_unquote(request.form.get('url', ''))
    body = (
        request.form.get('message')
        + "\n\n----------------------------------------\n\n"
        + url + "\n"
        + 'User-Agent: ' + request.headers.get('User-Agent', default='')
        + 'From: ' + request.requester.get('email', '')
        )
    send_mail(heads, body)
    if request.form.get('send_copy'):
        heads.update(To = request.requester.get('email', ''))
        send_mail(heads, body)
    response.context['success'] = True


def home_url(user):
    """ Returns default URL for given state.User """
    return abs_url(domain = user.get('sites', [config.server_name])[0]) + '*'
def login(request, response):
    if auth.handle_login(request, response):
        return redirect(response, home_url(request.requester))

# Possible values for the POST variable 'action'
actions = dict(
     login           = login
    ,logout          = auth.handle_logout
    ,expr_save       = expr_save
    ,expr_delete     = expr_delete
    ,files_create    = files_create
    ,user_create     = user_create
    ,mail_us         = mail_us
    ,mail_them       = mail_them
    ,mail_feedback   = mail_feedback
    ,user_tag_add    = user_tag_update
    ,user_tag_remove = user_tag_update
    ,tag_remove      = expr_tag_update
    ,tag_add         = expr_tag_update
    ,admin_update    = admin_update
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

def format_card(e):
    def title_len(t):
        l = len(t)
        if l < 10: return 1
        if l < 20: return 2
        return 3

    dict.update(e
        ,updated = friendly_date(time_u(e['updated']))
        ,url = abs_url(domain=e['domain']) + e['name']
        ,title_len = title_len(e['title'])
        #,title = e['title'][0:50] + '...' if len(e['title']) > 50 else e['title']
        ,tags = e.get('tags_index', [])
        )
    return e

def expr_list(spec, **args):
    return map(format_card, Expr.list(spec, **args))

def expr_home_list(tag, request, response):
    root = get_root()
    #tag = p2 if p1 else lget(root.get('tags'), 0) # make first tag/category default community page
    ids = root.get('tagged', {}).get(tag, [])
    if ids:
        by_id = {}
        for e in Expr.list({'_id' : {'$in':ids}}, requester=request.requester.id): by_id[e['_id']] = e
        exprs = [by_id[i] for i in ids]
    else: exprs = Expr.list({}, sort='created')
    response.context['exprs'] = map(format_card, exprs)
    response.context['tag'] = tag
    response.context['tags'] = root.get('tags', [])
    response.context['show_name'] = True

def handle(request):
    """The HTTP handler.
       All POST requests must be sent to thenewhive.com, as opposed to
       user.thenewhive.com which can contain arbitrary scripts. Any
       response for thenewhive.com must not contain unsanitized user content.
       Accepts werkzeug.Request, returns werkzeug.Response"""

    response = Response()
    request.requester = auth.authenticate_request(request, response)
    request.trusting = False
    response.context = { 'f' : request.form, 'url' : request.base_url }
    response.user = request.requester

    request.path = request.path[1:] # drop leading '/'
    request.domain = request.host.split(':')[0]
    if request.domain == config.server_name:
        if request.is_secure and request.requester and request.requester.logged_in:
            request.trusting = True

        reqaction = request.form.get('action', False)
        if reqaction:
            r = actions.get(reqaction,
                lambda _,__: raises(exceptions.BadRequest('action: '+reqaction))
                )(request, response)
            if type(r) == Response: return r
            if r != None: return serve_json(response, r, as_text = True)

        parts = request.path.split('/', 1)
        p1 = lget(parts, 0)
        p2 = lget(parts, 1)
        if p1 == 'file':
            res = File.fetch(p2)
            if not res: return serve_404(request, response)
            #if response.enforce_static and unsafe_mimes.get(resource['mime'], False):
            #    raise DangerousContent()
            response.content_type = res['mime']
            response.headers.add('Content-Disposition', 'inline', filename=res['name'])
            with open(res['fs_path']) as f: response.data = f.read()
            return response
        elif p1 == 'edit':
            if not p2:
                exp = { 'domain' : lget(request.requester.get('sites'), 0) }
                exp.update(dfilter(request.args, ['domain', 'name', 'tags']))
                exp['title'] = 'Untitled'
                exp['auth'] = 'public'
                if len(Expr.list({ 'owner_name' : request.requester['name'] }, limit=3, requester=request.requester.id)) <= 1:
                    exp.update(config.intro_expr)
            else: exp = Expr.fetch(p2)
            if not exp: return serve_404(request, response)
            response.context['title'] = 'Editing: ' + exp['title']
            response.context['sites'] = request.requester.get('sites')
            response.context['exp_js'] = json.dumps(exp)
            response.context['exp'] = exp
            return serve_page(response, 'edit.html')
        elif p1 == 'signup':
            referral = fetch('referral', request.args.get('key'), keyname='key')
            if not referral: return bad_referral(request, response)
            return serve_page(response, 'user_settings.html')
        elif p1 == 'referral' and request.requester.logged_in:
            if(request.requester['referrals'] <= 0):
                return no_more_referrals(request.requester['name'], request, response)
            key = junkstr(16)
            create('referral', user = request.requester.id, key = key)
            response.context['content'] = abs_url(secure=True) + 'signup?key=' + key
            return serve_page(response, 'minimal.html')
        elif p1 == 'feedback': return serve_page(response, 'feedback.html')
        elif p1 == '' or p1 == 'home':
            if request.requester.logged_in: expr_home_list(p2, request, response)
            return serve_page(response, 'home.html')
        elif p1 == 'admin_home' and request.requester.logged_in:
            root = get_root()
            if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
            response.context['tags_js'] = json.dumps(root.get('tags'))
            response.context['tagged_js'] = json.dumps(root.get('tagged'), indent=2)

            expr_home_list(p2, request, response)
            return serve_page(response, 'admin_home.html')
        elif p1 == 'contacts' and request.requester.get('name') in config.admins:
            response.headers.add('Content-Disposition', 'inline', filename='contacts.csv')
            response.data = "\n".join([','.join(map(json.dumps, [time_u(o['created']).strftime('%Y-%m-%d %H:%M'), o.get('email',''), o.get('msg','')])) for o in Contact.search()])
            response.content_type = 'text/csv; charset=utf-8'
            return response
        #else:
        #    # search for expressions with given tag
        #    exprs = Expr.list({'_id' : {'$in':ids}}, requester=request.requester.id, sort='created') if tag else Expr.list({}, sort='created')
        #    response.context['exprs'] = map(format_card, exprs)
        #    response.context['tag'] = tag
        #    response.context['tags'] = root.get('tags', [])
        #    response.context['show_name'] = True
        #    return serve_page(response, 'home.html')

        return serve_404(request, response)

    elif request.domain.startswith('www.'):
        return redirect(response, abs_url(secure=request.is_secure, domain=request.domain[4:]))

    d = resource = Expr.named(request.domain, request.path.lower())
    if not d: d = Expr.named(request.domain, '')
    if not d: return serve_404(request, response)
    owner = User.fetch(d['owner'])
    is_owner = request.requester.logged_in and owner.id == request.requester.id

    response.context.update(
         domain = request.domain
        ,owner = owner
        ,owner_url = home_url(owner)
        ,path = request.path
        ,user_is_owner = is_owner
        )

    if lget(request.path, 0) == '*':
        page = int(request.args.get('p', 0))
        spec = { 'owner' : owner.id }
        tag = request.path[1:]
        if tag: spec['tags_index'] = tag

        response.context['title'] = owner['fullname']
        response.context['fullname'] = owner['fullname']
        response.context['tag'] = tag
        response.context['tags'] = owner.get('tags', []) #tags_by_frequency(owner=owner.id)
        response.context['exprs'] = expr_list(spec, requester=request.requester.id, page=page)
        response.context['view'] = request.args.get('view')
        response.context['expr'] = dfilter(owner, ['background'])

        return serve_page(response, 'expr_cards.html')
        #response.context['page'] = page


    if not resource: return serve_404(request, response)
    if resource.get('auth') == 'private' and not is_owner: return serve_404(request, response)

    (html, css) = exp_to_html(resource)
    response.context.update(
         edit = abs_url(secure = True) + 'edit/' + resource.id
        ,mtime = friendly_date(time_u(resource['updated']))
        ,title = resource.get('title', False)
        ,auth_required = (resource.get('auth') == 'password' and resource.get('password')
            and request.form.get('password') != resource.get('password')
            and request.requester.id != resource['owner'])
        ,body = html
        ,css = css
        ,exp = resource
        ,exp_js = json.dumps(resource)
        )

    resource.increment_counter('views')
    return serve_page(response, 'expression.html')


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


# www_expression -> String
def exp_to_html(exp):
    """Converts JSON object representing an expression to HTML"""

    apps = exp.get('apps')
    if not apps: return ('', '')

    def css_for_app(app, html_id):
        return "#%s { left:%dpx; top:%dpx; width:%dpx; height:%dpx; %s; z-index : %d; }\n" % (
            html_id,
            app['position'][0],
            app['position'][1],
            app['dimensions'][0],
            app['dimensions'][1],
            'font-size : ' + str(app['scale']) + 'em' if app.get('scale') else '',
            app['z']
            )

    html_ids = map(lambda num: 'h_' + str(num), range(0, len(apps)))

    def html_for_app(app, html_id):
        content = app.get('content', '')
        if app.get('type', '') == 'hive.image':
            html = ("<div class='happ' id='%s'><img class='happ' src='%s'></div>"
                % (html_id, content))
            link = app.get('href')
            if link: html = "<a href='%s'>%s</a>" % (link, html)
            return html
        if app.get('type') == 'hive.text' or app.get('type') == 'hive.html':
            return "<div class='happ' id='%s'>%s</div>" % (html_id, content)
        return ""

    css = (''.join(map(css_for_app, apps, html_ids)) + "\n"
        + "body { height:%dpx; }\n"
            % max(map(lambda a: a['position'][1] + a['dimensions'][1], apps))
        )
    html = ''.join(map(html_for_app, apps, html_ids))
    return (html, css)


jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(joinpath(config.src_home, 'templates')))

def serve_html(response, html):
    response.data = html
    response.content_type = 'text/html; charset=utf-8'
    return response
def serve_page(response, template):
    return serve_html(response, render_template(response, template))
def render_template(response, template):
    context = response.context
    context.update(
         home_url = home_url(response.user)
        ,user = response.user
        ,create = abs_url(secure = True) + 'edit'
        ,server = abs_url()
        ,secure_server = abs_url(secure = True)
        ,server_name = config.server_name
        ,colors = colors
        ,debug = config.debug_mode
        )
    context.setdefault('icon', '/lib/skin/1/logo.png')
    return jinja_env.get_template('pages/' + template).render(context)

def serve_json(response, val, as_text = False):
    """ as_text is used when content is received in an <iframe> by the client """

    response.mimetype = 'application/json' if not as_text else 'text/plain'
    response.data = json.dumps(val)
    return response
# maybe merge with serve_json?
#def serve_jsonp(request, response, val):
#    response.mimetype = 'application/javascript'
#    response.data = ( request.args.get('callback', 'alert')
#        + '(' + json.dumps(val) +');' )
#    return response

def serve_404(request, response):
    response.status_code = 404
    response.context['msg'] = 'Nothing here yet...'
    return serve_page(response, 'error.html')

def serve_error(request, msg):
    response.status_code = 500
    response.context['msg'] = msg
    return serve_page(response, 'error.html')

def redirect(response, location):
    response.location = location
    response.status_code = 303
    return response

class InternalServerError(exceptions.InternalServerError):
    def get_body(self, environ):
        return "Something's broken inside"

#class DangerousContent(exceptions.UnsupportedMediaType):
#    def get_body(self, environ):
#        return "If you saw this, something bad could happen"

class Forbidden(exceptions.Forbidden):
    def get_body(self, environ):
        return "You can no looky sorry"

#def parse_host(host):
#    domain = host.split(':')[0]
#    domain_parts = domain.split('.')
#    site_domain = '.'.join(domain_parts[-2:])
#    sub_domain = domain_parts[0] if len(domain_parts) > 2 else None
#    return (domain, site_domain, sub_domain)

def abs_url(secure = False, domain = None):
    """Returns absolute url for this server, like 'https://thenewhive.com:1313/' """

    proto = 'https' if secure else 'http'
    port = config.ssl_port if secure else config.plain_port
    port = '' if port == 80 or port == 443 else ':' + str(port)
    return (proto + '://' + (domain or config.server_name) + port + '/')

def friendly_date(then):
    """Accepts datetime.datetime, returns string such as 'May 23' or '1 day ago'. """

    now = datetime.utcnow()
    dt = now - then
    months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    s = months[then.month] + ' ' + str(then.day)
    if then.year != now.year: s += ' ' + str(then.year)
    if dt.days < 7:
        if not dt.days:
            if dt.seconds < 3600: (t, u) = (dt.seconds / 60, 'minute')
            else: (t, u) = (dt.seconds / 3600, 'hour')
        else: (t, u) = (dt.days, 'day')
        s = str(t) + ' ' + u + ('s' if t > 1 else '') + ' ago'
    return s

# run_simple is not so simple
if __name__ == '__main__':
    from werkzeug import run_simple
    import OpenSSL.SSL as ssl
    import os
    import signal

    ctx = ssl.Context(ssl.SSLv3_METHOD)
    ctx.use_certificate_file(config.ssl_cert)
    ctx.use_privatekey_file(config.ssl_key)

    child = os.fork()
    if(child):
        run_simple(
            '0.0.0.0'
          , config.plain_port
          , application
          , use_reloader = True
          , use_debugger = config.debug_mode
          , use_evalex = config.debug_unsecure # from werkzeug.debug import DebuggedApplication
          , static_files = { '/lib': joinpath(config.src_home, 'lib') } # from werkzeug import SharedDataMiddleware
          , processes = 0
          )
    else:
        run_simple(
            '0.0.0.0'
          , config.ssl_port
          , application
          , use_reloader = True
          , use_debugger = config.debug_mode
          , use_evalex = config.debug_unsecure # from werkzeug.debug import DebuggedApplication
          , static_files = { '/lib': joinpath(config.src_home, 'lib') } # from werkzeug import SharedDataMiddleware
          , ssl_context  = ctx
          , processes = 0
          )
