# Copyright 2011, Abram Clark & A Reflection Of LLC
# thenewhive.com WSGI server version 0.2

import os, re, json, mimetypes
from datetime import datetime
from os.path  import dirname, exists, join as joinpath
from werkzeug import Request, Response, exceptions
import jinja2

import config, auth
from colors import colors
from state import Expr, File, User, junkstr, create, fetch, DuplicateKeyError, time_u, normalize, tags_by_frequency

def lget(L, i, default=None): return L[i] if 0 <= i < len(L) else default
def raises(e): raise e
def dfilter(d, keys):
    """ Accepts dictionary and list of keys, returns a new dictionary
        with only the keys given """
    r = {}
    for k in keys:
        if d.has_key(k): r[k] = d[k]
    return r

def expr_save(request, response):
    """ Parses JSON object from POST variable 'exp' and stores it in database.
        If the name (url) does not match record in database, create a new record."""

    if not request.trusting: raise exceptions.BadRequest()
    try: exp = Expr(json.loads(request.form.get('exp', '0')))
    except: exp = False
    if not exp: raise ValueError('missing or malformed exp')

    res = Expr.fetch(exp.id)
    upd = dfilter(exp, ['name', 'domain', 'title', 'apps', 'auth', 'password', 'tags'])
    upd['name'] = upd['name'].lower()
    try:
        if not exp.id or upd['name'] != res['name']:
            res = Expr.create(owner = request.requester.id, **upd)
        else:
            if not res['owner'] == request.requester.id:
                raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
            res.update(**upd)
    except DuplicateKeyError: return dict( error='An expression already exists with the URL: ' + upd['name'])
    return dict( error=False, location=abs_url(domain = res['domain']) + res['name'] )

def expr_delete(request, response):
    if not request.trusting: raise exceptions.BadRequest()
    e = Expr.fetch(request.form.get('id'))
    if not e: return serve_404(request, response)
    if e['owner'] != request.requester.id: raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
    e.delete()
    return redirect(response, home_url(request.requester))

def media_path(user): return joinpath(config.domain_home, config.server_name, user['name'], 'media')
def files_create(request, response):
    """ Saves a file uploaded from the expression editor, responds
    with a json object representing that file, passed to the
    JavaScript Hive.new_app function in lib/ee/main.js.

     * text/txt files are not saved and simply returned in a text box
     * all other file types are saved in the user's media folder
     * mp3 and image files are handled specifically by the editor
     * for all other files a link in a text box is returned
    """

    if not request.trusting: raise exceptions.BadRequest()

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
            path = joinpath(media_path(request.requester), res.id)
            file.save(path)
            res.update(fs_path = path)
            url =  abs_url() + 'file/' + res.id

            if mime == 'audio/mpeg':
                app['content'] = ("<object type='application/x-shockwave-flash' data='/lib/player.swf' width='100%' height='24'>"
                    +"<param name='FlashVars' value='soundFile=" + url + "'>"
                    +"<param name='wmode' value='transparent'></object>"
                    )
                app['type'] = 'hive.html'
                app['dimensions'] = [200, 24]
            elif mime in ['image/jpeg', 'image/png', 'image/gif']:
                app['type'] = 'hive.image'
                app['content'] = url
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

    args = dfilter(request.form, ['name', 'password', 'email', 'fullname'])
    args['referrer'] = referral['user']
    user = User.create(**args)
    referrer.update(referrals = referrer['referrals'] - 1)
    referral.delete()

    Expr.create(
          owner  = user.id
        , name   = ''
        , domain = user['name'] + '.' + config.server_name
        , title  = 'Untitled'
        )

    os.makedirs(joinpath(config.domain_home, config.server_name, user['name'], 'media'))

    request.form = dict(username = args['name'], secret = args['password'])
    return login(request, response)
def no_more_referrals(referrer, request, response):
    response.context['content'] = 'User %s has no more referrals' % referrer
    return serve_page(response, 'minimal.html')
def bad_referral(request, response):
    response.context['content'] = 'Invalid referral; already used or never existed'
    return serve_page(response, 'minimal.html')

from mailer import Mailer, Message
def mail_us(request, response):
    if not request.form.get('message'): return

    Mailer().send(Message(
          To = 'info@thenewhive.com'
        , From = 'www-data@' + config.server_name
        , Subject = '[home page contact form]'
        , Body = request.form.get('message')
        ))
    return ''

def home_url(user):
    """ Returns default URL for given state.User """
    return abs_url(domain = user.get('sites', [config.server_name])[0])
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

def handle(request):
    """The HTTP handler.
       All POST requests must be sent to thenewhive.com, as opposed to
       user.thenewhive.com which can contain arbitrary scripts. Any
       response for thenewhive.com must not contain unsanitized user content.
       Accepts werkzeug.Request, returns werkzeug.Response"""

    response = Response()
    request.requester = auth.authenticate_request(request, response)
    request.trusting = False
    response.context = { 'f' : request.form }
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

        if request.path == '':
            return serve_page(response, 'home.html')

        parts = request.path.split('/', 1)
        p1 = lget(parts, 0)
        p2 = lget(parts, 1)
        if p1 == 'file':
            res = File.fetch(p2)
            #if response.enforce_static and unsafe_mimes.get(resource['mime'], False):
            #    raise DangerousContent()
            response.content_type = res['mime']
            response.headers.add('Content-Disposition', 'inline', filename=res['name'])
            with open(res['fs_path']) as f: response.data = f.read()
            return response
        elif p1 == 'edit':
            if not p2:
                exp = { 'domain' : lget(request.requester.get('sites'), 0) }
                exp.update(dfilter(request.form, ['domain', 'name']))
                exp['title'] = 'Untitled'
                exp['auth'] = 'public'
            else: exp = Expr.fetch(p2)
            if not exp: return serve_404(request, response)
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

        return serve_404(request, response)
    elif request.domain == 'www.' + config.server_name: return redirect(response, abs_url())

    if request.requester.logged_in:
        response.context['user_is_owner'] = request.domain in request.requester['sites']
    response.context.update(
         domain = request.domain
        ,path = request.path
        ,create = abs_url(secure = True) + 'edit'
        )

    resource = Expr.fetch_by_names(request.domain, request.path.lower())
    if not resource: return serve_404(request, response)
    if resource['owner'] != request.requester.id and resource.get('auth') == 'private':
        return serve_404(request, response)

    # prevent XSS
    #enforce_static = ( request.trusting and (owner.id != request.requester.id) )

    owner = User.fetch(resource['owner'])

    if request.args.get('view'):
        page = int(request.args.get('p', 0))
        exprs = Expr.list(50, page, owner=owner.id, requester=request.requester.id)

        def title_len(t):
            l = len(t)
            if l < 10: return 1
            if l < 20: return 2
            return 3
        def fmt(e):
            dict.update(e
                ,updated = friendly_date(time_u(e['updated']))
                ,url = abs_url(domain=e['domain']) + e['name']
                ,title_len = title_len(e['title'])
                #,title = e['title'][0:50] + '...' if len(e['title']) > 50 else e['title']
                ,tags = ['#' + t for t in e.get('index', ['foo','bar'])]
                )
            return e

        response.context['tags'] = tags_by_frequency(owner=owner.id)
        response.context['exprs'] = map(fmt, exprs)
        return serve_page(response, 'expr_cards.html')
        #response.context['page'] = page


    (html, css) = exp_to_html(resource)
    response.context.update(
         owner = owner
        ,id = resource.id
        ,owner_url = home_url(owner)
        ,edit = abs_url(secure = True) + 'edit/' + resource.id
        ,mtime = friendly_date(time_u(resource['updated']))
        ,title = resource.get('title', False)
        ,name = resource['name']
        ,auth_required = (resource.get('auth') == 'password'
            and request.form.get('password') != resource.get('password')
            and request.requester.id != resource['owner'])
        ,body = html
        ,css = css
        ,exp_js = json.dumps(resource)
        )

    return serve_page(response, 'expression.html')


@Request.application
def handle_safe(request):
    """Log exceptions thrown, display friendly error message.
       Not implemneted."""
    try: return handle(request)
    except Exception as e: return serve_error(request, e)

@Request.application
def handle_debug(request):
    """Allow exceptions to be handled by werkzeug for debugging"""
    return handle(request)

application = handle_debug
#if config.debug_mode: application = handle_debug
#else: application = handle_safe


# www_expression -> String
def exp_to_html(exp):
    """Converts JSON object representing an expression as stored in database to HTML"""

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
    response.content_type = 'text/html'
    return response
def serve_page(response, template):
    return serve_html(response, render_template(response, template))
def render_template(response, template):
    context = response.context
    context.update(
         home_url = home_url(response.user)
        ,user = response.user
        ,server = abs_url()
        ,secure_server = abs_url(secure = True)
        ,server_name = config.server_name
        ,colors = colors
        ,debug = config.debug_mode
        )
    context.setdefault('icon', abs_url() + 'lib/skin/1/icon.png')
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
    return serve_page(response, 'notfound.html')

def serve_error(request, e):
    # report error
    #r = Response()
    #r.data = str(request.environ)
    return InternalServerError()

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
          , use_debugger = config.debug_unsecure # from werkzeug.debug import DebuggedApplication
          , static_files = { '/lib': joinpath(config.src_home, 'lib') } # from werkzeug import SharedDataMiddleware
          )
    else:
        run_simple(
            '0.0.0.0'
          , config.ssl_port
          , application
          , use_reloader = True
          , use_debugger = config.debug_unsecure # from werkzeug.debug import DebuggedApplication
          , static_files = { '/lib': joinpath(config.src_home, 'lib') } # from werkzeug import SharedDataMiddleware
          , ssl_context  = ctx
          )

    os.kill(child, signal.SIGKILL) # does run_simple ever return?
