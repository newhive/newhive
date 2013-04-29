import cgi
import werkzeug.urls
import uuid
from md5 import md5
import subprocess
import os
from newhive import config, utils
from newhive.controllers.base import ModelController

class Expr(ModelController):
    model_name = 'Expr'

    def fetch(self, tdata, request, response, id):
        expr_obj = self.db.Expr.fetch(id)
        return self.serve_json(response,expr_obj)

    def fetch_naked(self, tdata, request, response, expr_id):
        # Request must come from content_domain, as this serves untrusted content
        # TODO: get routing to take care of this
        if request.host != utils.url_host(on_main_domain=False,secure=request.is_secure):
            return self.redirect('/')
        expr_obj = self.db.Expr.fetch(expr_id)
        tdata.context.update(
                html = self.expr_to_html(expr_obj)
                , expr = expr_obj
                , use_ga = False
                , expr_script = expr_obj.get('script')
                , expr_style = expr_obj.get('style'))
        return self.serve_page(tdata, response, 'pages/expr.html')
    
    def expr_to_html(self, exp):
        """Converts JSON object representing an expression to HTML"""
        if not exp: return ''

        def css_for_app(app):
            css = {
                    'left': app['position'][0]
                    , 'top': app['position'][1]
                    , 'z-index': app['z']
                    , 'width': app['dimensions'][0]
                    , 'height': app['dimensions'][1]
                    , 'opacity': app.get('opacity', 1)
                    , 'font-size': app.get('scale')
                    }
            rv = "left: {left}px; top: {top}px; z-index: {z-index}; opacity: {opacity};".format(**css)
            if not app.get('type') == 'hive.raw_html':
                rv += "width: {width}px; height: {height}px; ".format(**css)
            if app.get('scale'):
                rv += "font-size: {font-size}em;".format(**css)
            return rv

        def html_for_app(app):
            content = app.get('content', '')
            more_css = ''
            type = app.get('type')
            id = app.get('id', app['z'])
            if type == 'hive.image':
                html = "<img src='%s'>" % content
                link = app.get('href')
                if link: html = "<a href='%s'>%s</a>" % (link, html)
            elif type == 'hive.sketch':
                html = "<img src='%s'>" % content.get('src')
            elif type == 'hive.rectangle':
                c = app.get('content', {})
                more_css = ';'.join([p + ':' + str(c[p]) for p in c])
                html = ''
            elif type == 'hive.html':
                encoded_content = cgi.escape(app.get('content',''), quote=True)
                html = '<div class="happ happ-content" data-content="%s"></div>' % encoded_content
            else:
                html = content
            data = " data-angle='" + str(app.get('angle')) + "'" if app.get('angle') else ''
            data += " data-scale='" + str(app.get('scale')) + "'" if app.get('scale') else ''
            return "<div class='happ %s' id='app%s' style='%s'%s>%s</div>" %\
                (type.replace('.', '_'), id, css_for_app(app) + more_css, data, html)

        app_html = map( html_for_app, exp.get('apps', []) )
        if exp.has_key('dimensions'):
            app_html.append("<div id='expr_spacer' class='happ' style='top: {}px;'></div>".format(exp['dimensions'][1]))
        if exp.has_key('fixed_width'):
            app_html = ['<div class="expr_container" style="width: {}px">'.format(exp['fixed_width'])] + \
                app_html + ['</div>']
        return ''.join(app_html)
