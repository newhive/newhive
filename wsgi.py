# Copyright 2011, Abram Clark & A Reflection Of LLC
# thenewhive.com WSGI server version 0.2

import os, re, json, mimetypes
from datetime import datetime
from os.path  import dirname, exists, join as joinpath
from werkzeug import Request, Response, exceptions
import jinja2

import config, auth
from colors import colors
from state import Expr, File, User


def exp_save(request, response):
    if not request.trusting: raise exceptions.BadRequest()
    try: exp = json.loads(request.form.get('exp', '0'))
    except: exp = False
    if not exp: return ValueError('missing or malformed exp')

    res = Expr(exp)
    try: res.update(name  = exp['name'] ,title = exp['title'] ,apps  = exp['apps'])
    except DuplicateKeyError: return dict( error='An expression already exists with that URL' )
    return dict( error=False, location=abs_url(domain = res['domain']) + res['name'] )

def exp_create(request, response):
    if not request.trusting: raise exceptions.BadRequest()
    new_name = request.form.get('path',
        '.'.join(map(str, datetime.utcnow().timetuple()[0:6])))
    expr = Expr.create(
         owner = request.requester.id
        ,domain = request.form['domain']
        ,name = new_name
        ,title = 'Untitled'
        ,apps = {}
        )
    return redirect(response, abs_url(secure=True) + 'expr/' + expr.id)

def media_path(user): return joinpath(config.domain_home, config.server_name, user['name'], 'media')
def save_files(request, response):
    if not request.trusting: raise exceptions.BadRequest()

    names = []
    for file_name in request.files:
        file = request.files[file_name]
        mime = mimetypes.guess_type(file.filename)[0]
        if not mime: raise ValueError('Unrecognized file type')

        #if exists(joinpath(media_path(request.requester), file.filename)):
        #    m = re.search('(.*?)(_([0-9]+))?(\..*?$)', file.filename)
        #    if m.groups()[2]: file.filename = m.groups()[0] + '_' + str(int(m.groups()[2]) + 1) + m.groups()[3]
        #    else: file.filename = m.groups()[0] + '_1' + m.groups()[3]
        #path = joinpath(media_path(request.requester), file.filename)

        res = File.create(
             owner = request.requester.id
            ,name = file.filename
            ,mime = mime
            )
        path = joinpath(media_path(request.requester), res.id)
        file.save(path)
        res.update(fs_path = path)
        names.append(abs_url() + 'file/' + res.id)
    return names

def home_url(user):
    return abs_url(domain = user.get('sites', [config.server_name])[0])
def login(request, response):
    auth.handle_login(request, response)
    return redirect(response, home_url(request.requester))

actions = {
      'login'       : login
    , 'logout'      : auth.handle_logout
    , 'create'      : exp_create
    , 'save_exp'    : exp_save
    , 'save_files'  : save_files
    }

unsafe_mimes = {
      'text/xml'                       : True
    , 'application/xml'                : True
    , 'application/xhtml'              : True
    , 'application/x-shockwave-flash'  : True
    , 'text/x-sgml'                    : True
    , 'text/html'                      : True
    , 'text/xhtml'                     : True
#    , 'application/x-javascript'       : True
    }

def handle(request):
    response = Response()
    response.context = {}
    request.requester = auth.authenticate_request(request, response)
    request.trusting = False

    request.path = request.path[1:] # drop leading '/'
    request.domain = request.host.split(':')[0]
    if request.domain == config.server_name:
        if request.is_secure and request.requester and request.requester.logged_in:
            request.trusting = True

        reqaction = request.form.get('action', False)
        if reqaction:
            r = actions.get(reqaction, lambda _,__: raises(exceptions.BadRequest())
                )(request, response)
            if type(r) == Response: return r
            if r != None: return serve_json(response, r, html = True)

        if request.path == '':
            return serve_html(response, request.requester, 'home.html')

        parts = request.path.split('/')
        (p1, p2) = (None, None)
        if len(parts) >= 2: (p1, p2) = (parts[0], '/'.join(parts[1:]))
        if p1 == 'file':
            res = File.fetch(p2)
            #if response.enforce_static and unsafe_mimes.get(resource['mime'], False):
            #    raise DangerousContent()
            response.content_type = res['mime']
            with open(res['fs_path']) as f: response.data = f.read()
            return response
        if p1 == 'expr':
            exp = Expr.fetch(p2)
            if not exp: return serve_404(response, request.requester)
            response.context['exp_js'] = json.dumps(exp)
            response.context['exp'] = exp
            return serve_html(response, request.requester, 'edit.html')

        return serve_404(response, request.requester)

    if request.requester.logged_in:
        response.context['user_is_owner'] = request.domain in request.requester['sites']
    response.context['domain'] = request.domain
    response.context['path'] = request.path

    resource = Expr.fetch_by_names(request.domain, request.path)
    if not resource: return serve_404(response, request.requester)

    #enforce_static = ( request.trusting and (owner.id != request.requester.id) )

    response.context['owner'] = User.fetch(resource['owner'])
    response.context['edit'] = abs_url(secure = True) + 'expr/' + resource.id
    response.context['mtime'] = friendly_date(apply(datetime, resource['updated']))
    response.context['title'] = resource.get('title', False)
    (response.context['body'], response.context['css']) = exp_to_html(resource)
    return serve_html(response, request.requester, 'expression.html')


@Request.application
def handle_safe(request):
    try: return handle(request)
    except Exception as e: return serve_error(request, e)
@Request.application
def application(request): return handle(request)
#def handle_debug(request): return handle(request)
#if config.debug_mode: application = handle_debug
#else: application = handle_safe


# www_expression -> String
def exp_to_html(exp, enforce_static = True):
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
        if app.get('type') == 'hive.text':
            return "<div class='happ' id='%s'>%s</div>" % (html_id, content)
        return ""

    css = (''.join(map(css_for_app, apps, html_ids)) + "\n"
        + "body { height:%dpx; }\n"
            % max(map(lambda a: a['position'][1] + a['dimensions'][1], apps))
        )
    html = ''.join(map(html_for_app, apps, html_ids))
    return (html, css)


jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(joinpath(config.src_home, 'templates')))

def serve_html(response, requester, template):
    response.data = render_template(response, requester, template)
    response.content_type = 'text/html'
    return response
def render_template(response, requester, template):
    context = response.context
    context.update(
         user = requester
        ,logged_in = requester.logged_in
        ,home_url = home_url(requester)
        ,server = abs_url()
        ,secure_server = abs_url(secure = True)
        ,server_name = config.server_name
        ,colors = colors
        )
    context.setdefault('icon', abs_url() + 'lib/skin/1/icon.png')
    return jinja_env.get_template('pages/' + template).render(context)

def serve_json(response, val, html = False):
    response.mimetype = 'application/json' if not html else 'text/html'
    response.data = json.dumps(val)
    return response
# maybe merge with serve_json?
#def serve_jsonp(request, response, val):
#    response.mimetype = 'application/javascript'
#    response.data = ( request.args.get('callback', 'alert')
#        + '(' + json.dumps(val) +');' )
#    return response

def serve_404(response, requester):
    response.status_code = 404
    return serve_html(response, requester, 'notfound.html')

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

class DangerousContent(exceptions.UnsupportedMediaType):
    def get_body(self, environ):
        return "If you saw this, something bad could happen"

class Forbidden(exceptions.Forbidden):
    def get_body(self, environ):
        return "You can no looky sorry"

def parse_host(host):
    domain = host.split(':')[0]
    domain_parts = domain.split('.')
    site_domain = '.'.join(domain_parts[-2:])
    sub_domain = domain_parts[0] if len(domain_parts) > 2 else None
    return (domain, site_domain, sub_domain)

def abs_url(secure = False, domain = None):
    proto = 'https' if secure else 'http'
    port = config.ssl_port if secure else config.plain_port
    port = '' if port == 80 or port == 443 else ':' + str(port)
    return (proto + '://' + (domain or config.server_name) + port + '/')

def friendly_date(then):
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
          , use_debugger = config.debug_mode # from werkzeug.debug import DebuggedApplication
          , static_files = { '/lib': joinpath(config.src_home, 'lib') } # from werkzeug import SharedDataMiddleware
          )
    else:
        run_simple(
            '0.0.0.0'
          , config.ssl_port
          , application
          , use_reloader = True
          , use_debugger = config.debug_mode # from werkzeug.debug import DebuggedApplication
          , static_files = { '/lib': joinpath(config.src_home, 'lib') } # from werkzeug import SharedDataMiddleware
          , ssl_context  = ctx
          )

    os.kill(child, signal.SIGKILL) # does run_simple ever return?

def raises(e): raise e
