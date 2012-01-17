import time
from datetime import datetime
from newhive import config, colors
from state import abs_url
import os, re, json
import newhive.ui_strings.en as ui

def lget(L, i, *default):
    try: return L[i]
    except: return default[0] if default else None
def raises(e): raise e
def dfilter(d, keys):
    """ Accepts dictionary and list of keys, returns a new dictionary
        with only the keys given """
    r = {}
    for k in keys:
        if k in d: r[k] = d[k]
    return r
def date_to_epoch(*args): return int(time.mktime(datetime(*args).timetuple()))
#def serve_html(response, html):
#    response.data = html
#    response.content_type = 'text/html; charset=utf-8'
#    return response
#def serve_page(response, template):
#    return serve_html(response, render_template(response, template))
#def render_template(response, template):
#    context = response.context
#    context.update(
#         home_url = response.user.get_url()
#        ,feed_url = response.user.get_url(path='feed')
#        ,user = response.user
#        ,admin = response.user.get('name') in config.admins
#        ,create = abs_url(secure = True) + 'edit'
#        ,server = abs_url()
#        ,secure_server = abs_url(secure = True)
#        ,server_name = config.server_name
#        ,site_pages = dict([(k, abs_url(subdomain=config.site_user) + config.site_pages[k]) for k in config.site_pages])
#        ,colors = colors
#        ,debug = config.debug_mode
#        ,assets_env = assets_env
#        ,use_ga = config.use_ga
#        ,ui = ui
#        )
#    context.setdefault('icon', '/lib/skin/1/logo.png')
#    return jinja_env.get_template(template).render(context)
#
#def serve_json(response, val, as_text = False):
#    """ as_text is used when content is received in an <iframe> by the client """
#
#    response.mimetype = 'application/json' if not as_text else 'text/plain'
#    response.data = json.dumps(val)
#    return response
## maybe merge with serve_json?
##def serve_jsonp(request, response, val):
##    response.mimetype = 'application/javascript'
##    response.data = ( request.args.get('callback', 'alert')
##        + '(' + json.dumps(val) +');' )
##    return response
#
#def serve_404(request, response):
#    response.status_code = 404
#    return serve_page(response, 'pages/notfound.html')
#
#def serve_error(request, msg):
#    response.status_code = 500
#    response.context['msg'] = msg
#    return serve_page(response, 'pages/error.html')
#
#def redirect(response, location, permanent=False):
#    response.location = location
#    response.status_code = 301 if permanent else 303
#    return response


