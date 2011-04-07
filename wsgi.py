# Copyright 2011, Abram Clark & A Reflection Of LLC
# thenewhive.com WSGI server version 0.2

import os, pwd, stat
import json
from datetime import datetime
from os.path  import dirname, join as joinpath
from werkzeug import Request, Response, redirect, exceptions
import jinja2

import config, auth
from colors import colors
from fsquirrel import Resource, thread_add


def exp_create(request, response):
    try:
        os.makedirs(request.syspath)
        os.chmod(request.syspath, 0755)
    except: pass   
    path = joinpath(request.syspath,  'index.json')
    if not os.path.exists(path):
        with open(path,  'w+') as f:
            f.write('{}')
            os.fchmod(f.fileno(), 0644)
    #return abs_url(secure = True) + request.res_path + '?type=edit'

def exp_save(request, response):
    if not request.trusting: return exceptions.BadRequest()
    exp = request.form.get('exp', False)
    # TODO: sanitize, escape
    #exp = json.loads(request.form.get('exp', False))
    if not exp: return exceptions.BadRequest()

    path = request.syspath
    user_path = request.user_path
    if request.form.get('path', '') != request.user_path:
        user_path = request.form.get('path', '')
        path = joinpath(config.domain_home, request.site_path, user_path)
        os.renames(request.syspath, path)

    with open(joinpath(path, 'index.json'), 'w+') as f:
        f.write(exp)
        os.fchmod(f.fileno(), 0644)
    return abs_url(domain = request.user_host) + user_path

def save_files(request, response):
    if not request.trusting: return exceptions.BadRequest()
    names = []
    for file_name in request.files:
        file = request.files[file_name]
        name = joinpath(request.path, file.filename)
        fname = joinpath(request.syspath, file.filename)
        file.save(fname)
        os.chmod(fname, 0644)
        names.append(abs_url(secure = True) + name)
    return names

actions = {
      'login'       : auth.handle_login
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
    (request.requester, verified) = auth.authenticate_request(request, response)
    request.trusting = False

    (site_domain, user_domain) = parse_host(request.host)
    if user_domain == None and site_domain == config.server_name:
        print(str(request.is_secure) +"\n"+ str(request.requester.get('verified', False)))
        if request.is_secure and verified: request.trusting = True

        reqaction = request.form.get('action', False)
        if reqaction:
            r = actions.get(reqaction, lambda _,__: raises(exceptions.BadRequest())
                )(request, response)
            if r != None: return serve_json(response, r, html = True)

        if request.path == '/':
            return serve_html(response, request.requester, 'page_home.html')
        if request.args.get('type', False) == 'edit':
            response.context['site'] = request.user_host
            exp = Resource.fetch(request.syspath)
            if not exp: return serve_404(response, request.requester)
            response.context['exp'] = json.dumps(exp.meat)
            response.context['exp_path'] = json.dumps(request.user_path)
            response.context['title'] = exp.meat.get('title', '')
            return serve_html(response, request.requester, 'page_edit.html')

    resource = Resource.fetch(request.syspath)
    if not resource:
        # TODO: does not work with other websites 
        response.context['create'] = abs_url(secure = True) + res_path
        response.context['userisowner'] = user_domain == request.requester.get('name', False)
        return serve_404(response, request.requester)

    response.enforce_static = (request.trusting and
        (resource.owner['uid'] != request.requester['uid']) )

    if resource.type == 'plain':
        if response.enforce_static and unsafe_mimes.get(resource.mimetype, False):
            raise DangerousContent()
        response.content_type = resource.mimetype
        with open(resource.path) as f: response.data = f.read()
        return response

    icon = resource.owner.get('icon', False)
    if icon: response.context['icon'] = json.dumps(icon)
    response.context['owner'] = resource.owner
    response.context['mtime'] = friendly_date(resource.mtime)
    response.context['res_path'] = res_path
    if request.requester and resource.owner['uid'] == request.requester['uid']:
        response.context['userisowner'] = True
        response.context['create'] = (abs_url(secure = True) + request.site_path + '/untitled?type=edit')
        response.context['edit'] = abs_url(secure = True) + res_path + '?type=edit'

    response.context['title'] = resource.meat.get('title', False)
    (response.context['body'], response.context['css']) = exp_to_html(resource.meat)
    return serve_html(response, request.requester, 'page_expression.html')


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
    apps = exp.get('apps', None)
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
            link = app.get('href', False)
            if link: html = "<a href='%s'>%s</a>" % (link, html)
            return html
        if app.get('type', '') == 'hive.text':
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
    context['user'] = requester
    context['home_url'] = abs_url(domain = requester.get('client home', config.server_name))
    context['server'] = abs_url()
    context['secure_server'] = abs_url(secure = True)
    context['server_name'] = config.server_name
    context['colors'] = colors
    context.setdefault('icon', abs_url() + 'lib/skin/1/icon.png')
    return jinja_env.get_template(template).render(context)

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
    return serve_html(response, requester, 'page_notfound.html')

def serve_error(request, e):
    # report error
    #r = Response()
    #r.data = str(request.environ)
    return InternalServerError()

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
    return (site_domain, sub_domain)

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
