from bs4 import BeautifulSoup
import os, json, cgi, base64
from pymongo.errors import DuplicateKeyError
from newhive import utils
from newhive.utils import dfilter
from newhive.controllers.controller import ModelController

class Expr(ModelController):
    model_name = 'Expr'

    def save(self, tdata, request, response, **args):
        """ Parses JSON object from POST variable 'exp' and stores it in database.
            If the name (url) does not match record in database, create a new record."""

        try: expr = self.db.Expr.new(json.loads(request.form.get('expr', '0')))
        except: expr = False
        if not expr: raise ValueError('Missing or malformed expr')

        res = self.db.Expr.fetch(expr.id)
        allowed_attributes = ['name', 'domain', 'title', 'apps', 'dimensions',
            'auth', 'password', 'tags', 'background', 'thumb', 'images']
        # TODO: fixed expressions, styles, and scripts, need to be done right
        # if tdata.user.is_admin:
        #     allowed_attributes.extend(['fixed_width', 'script', 'style'])
        upd = dfilter(expr, allowed_attributes)
        upd['name'] = upd['name'].lower().strip('/ ')

        # deal with inline base64 encoded images from Sketch app
        for app in upd['apps']:
            if app['type'] != 'hive.sketch': continue
            data = base64.decodestring(app.get('content').get('src').split(',',1)[1])
            f = os.tmpfile()
            f.write(data)
            file_res = self.db.File.create(dict(
                owner=tdata.user.id,
                tmp_file=f,
                name='sketch',
                mime='image/png'
            ))
            f.close()
            app.update({
                 'type' : 'hive.image'
                ,'content' : file_res['url']
                ,'file_id' : file_res.id
            })

        if not res or upd['name'] != res['name'] or upd['domain'] != res['domain']:
            try:
              new_expression = True
              res = tdata.user.expr_create(upd)
              self.db.ActionLog.create(tdata.user, "new_expression_save", data={'expr_id': res.id})
              tdata.user.flag('expr_new')
              if tdata.user.get('flags').get('add_invites_on_save'):
                  tdata.user.unflag('add_invites_on_save')
                  tdata.user.give_invites(5)
            except DuplicateKeyError:
                if expr.get('overwrite'):
                    self.db.Expr.named(tdata.user['name'], upd['name']).delete()
                    res = tdata.user.expr_create(upd)
                    self.db.ActionLog.create(tdata.user, "new_expression_save", data={'expr_id': res.id, 'overwrite': True})
                else:
                     #'An expression already exists with the URL: ' + upd['name']
                    return self.serve_json(response, { 'error' : 'overwrite' })
                    self.db.ActionLog.create(tdata.user, "new_expression_save_fail", data={'expr_id': res.id, 'error': 'overwrite'})
        else:
            if not res['owner'] == tdata.user.id:
                raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
            res.update(**upd)
            new_expression = False

            self.db.UpdatedExpr.create(res.owner, res)
            self.db.ActionLog.create(tdata.user, "update_expression", data={'expr_id': res.id})

        # TODO-cleanup: create client_view for full expression record, instead
        # of just feed cards
        res['id'] = res.id
        return self.serve_json(response, res)

    def snapshot(self, tdata, request, response, expr_id, **args):
        expr_obj = self.db.Expr.fetch(expr_id)
        if expr_obj.private and tdata.user.id != expr_obj.owner.id:
            return self.serve_json(response,expr_obj)

        # expr_obj.take_snapshots()
        return self.redirect(response, expr_obj.snapshot('big', False)+".png")

    def fetch_naked(self, tdata, request, response, expr_id):
        # Request must come from content_domain, as this serves untrusted content
        # TODO: get routing to take care of this
        if request.host != utils.url_host(on_main_domain=False,secure=request.is_secure):
            return self.redirect('/')
        snapshot_mode = request.args.get('snapshot') is not None
        expr_obj = self.db.Expr.fetch(expr_id)
        tdata.context.update(
                html = self.expr_to_html(expr_obj,snapshot_mode=snapshot_mode)
                , expr = expr_obj
                , use_ga = False
                , expr_script = expr_obj.get('script')
                , expr_style = expr_obj.get('style'))
        return self.serve_page(tdata, response, 'pages/expr.html')
        
    def expr_to_html(self, exp, snapshot_mode=False):
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
                if snapshot_mode:
                    def get_embed_img_html(url):
                        ret_html = ''
                        oembed = utils.get_embedly_oembed(url)
                        if oembed and oembed.get('thumbnail_url'):
                            ret_html += '<img src="%s"/>' % oembed['thumbnail_url']
                        return ret_html
                    html = ''
                    # Turn embeds in hive.html blocks to static images
                    hivehtml = BeautifulSoup(app.get('content',''))
                    for iframe in hivehtml.find_all('iframe'):
                       html += get_embed_img_html(iframe.get('src'))
                    # Youtube embeds are <object>, and not <iframe>. We handle this
                    # special case here.
                    for object_tags in hivehtml.find_all('object'):
                        param_tags = object_tags.find_all('param')
                        for param in param_tags:
                            if param.get('name') == 'movie':
                                html += get_embed_img_html(param.get('value'))
                else:
                    encoded_content = cgi.escape(app.get('content',''), quote=True)
                    html = '%s' % (app.get('content',''))
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