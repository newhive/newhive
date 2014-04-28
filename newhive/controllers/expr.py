from bs4 import BeautifulSoup
import os, json, cgi, base64
from pymongo.errors import DuplicateKeyError
from functools import partial

from newhive import utils
from newhive.utils import dfilter
from newhive.controllers.controller import ModelController

class Expr(ModelController):
    model_name = 'Expr'

    def delete(self, tdata, request, response, **args):
        resp = {}
        expr_id = request.form.get("expr_id")

        print expr_id
        expr = self.db.Expr.fetch(expr_id)
        if not expr:
            resp = { 'error': 'Expression not found.' }
            return self.serve_json(response, resp)
        
        expr.delete()

        return self.serve_json(response, resp)

        
    def save(self, tdata, request, response, **args):
        """ Parses JSON object from POST variable 'exp' and stores it in database.
            If the name (url) does not match record in database, create a new record."""

        try: expr = self.db.Expr.new(json.loads(request.form.get('expr', '0')))
        except: expr = False
        if not expr: raise ValueError('Missing or malformed expr')

        res = self.db.Expr.fetch(expr.id)
        allowed_attributes = [
            'name', 'url', 'title', 'apps', 'dimensions', 'auth', 'password',
            'tags', 'background', 'thumb', 'images', 'remix_parent_id',
            'container'
        ]
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

        if not res or upd['name'] != res['name']:
            try:
              new_expression = True
              # Handle remixed expressions
              if upd.get('remix_parent_id'):
                parent_id = upd.get('remix_parent_id')
                remix_expr = self.db.Expr.fetch(parent_id)
                while parent_id:
                    remix_expr = self.db.Expr.fetch(parent_id)
                    parent_id = remix_expr.get('remix_parent_id')
                remix_owner = remix_expr.owner
                upd['remix_root'] = remix_expr.id
                remix_owner.setdefault('tagged', {})
                remix_expr.setdefault('remix_name', remix_expr['name'])
                remix_expr.setdefault('remix_root', remix_expr.id)
                remix_expr.update(updated=False, remix_name=remix_expr['remix_name'],
                    remix_root=remix_expr['remix_root'])
                remix_name = 're:' + remix_expr['remix_name']
                # include self in remix list
                remix_owner['tagged'].setdefault(remix_name, [remix_expr.id])
                upd['tags'] += " #remixed" # + remix_name

              res = tdata.user.expr_create(upd)
              self.db.ActionLog.create(tdata.user, "new_expression_save", data={'expr_id': res.id})

              # TODO-remix: handle moving ownership of remix list, especially if original is
              # made private or deleted.
              if upd.get('remix_parent_id'):
                remix_owner['tagged'][remix_name].append(res.id)
                remix_owner.update(updated=False, tagged=remix_owner['tagged'])
                # remix_expr.save(updated=False)

              tdata.user.flag('expr_new')
              #if tdata.user.get('flags').get('add_invites_on_save'):
              #    tdata.user.unflag('add_invites_on_save')
              #    tdata.user.give_invites(5)
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
            # remix: ensure that the remix tag is not deletable
            if res.get('remix_parent_id'):
                upd['tags'] += " #remixed" # + remix_name
            reserved_tags = ["remixed", "gifwall"];
            # TODO: disallow removal of reserved tags
            res.update(**upd)
            if not self.config.live_server and (upd.get('apps') or upd.get('background')):
                res.threaded_snapshot(retry=120)
            new_expression = False

            self.db.UpdatedExpr.create(res.owner, res)
            self.db.ActionLog.create(tdata.user, "update_expression", data={'expr_id': res.id})

        # TODO-cleanup: create client_view for full expression record, instead
        # of just feed cards
        res['id'] = res.id
        return self.serve_json(response, res)

    # the whole editor except the save dialog and upload code goes in sandbox
    def editor_sandbox(self, tdata, request, response, **args):
        return self.serve_page(tdata, response, 'pages/edit_sandbox.html')

    def snapshot(self, tdata, request, response, expr_id, **args):
        expr_obj = self.db.Expr.fetch(expr_id)
        if expr_obj.private and tdata.user.id != expr_obj.owner.id:
            return self.serve_json(response,expr_obj)

        # expr_obj.take_full_shot()
        if expr_obj.threaded_snapshot(full_page = True, time_out = 30):
            return self.redirect(response, expr_obj.snapshot_name('full'))

        return self.serve_404(tdata, request, response)

    def fetch_naked(self, tdata, request, response, expr_id=None,
        owner_name=None, expr_name=None, **args
    ):
        # Request must come from content_domain, as this serves untrusted content
        if expr_id:
            # hack for overlap of /owner_name and /expr_id routes
            expr_obj = self.db.Expr.fetch(expr_id) or self.db.Expr.named(expr_id, '')
        else:
            expr_obj = self.db.Expr.named(owner_name, expr_name)
        return self.serve_naked(tdata, request, response, expr_obj)

    def serve_naked(self, tdata, request, response, expr_obj):
        if not expr_obj:
            return self.serve_404(tdata, request, response)

        if (expr_obj.get('auth') == 'password'
            and not expr_obj.cmp_password(request.form.get('password'))
            and not expr_obj.cmp_password(request.args.get('pw'))):
            expr_obj = { 'auth': 'password' }

        # TODO: consider allowing analytics for content frame.
        viewport = [int(x) for x in
            request.args.get('viewport', '1000x750').split('x')]
        snapshot_mode = request.args.get('snapshot') is not None
        tdata.context.update(
            html = self.expr_to_html(expr_obj, snapshot_mode=snapshot_mode,
                viewport=viewport),
            expr = expr_obj,
            use_ga = False,
        )
        if snapshot_mode:
            tdata.context['css'] = "body { overflow-x: hidden; }"
        client_data = {}
        for app in expr_obj.get('apps',[]):
            app_id = app.get('id', 'app_' + str(app['z']))
            data = app.get('client_data', {})
            data.update(media=app.get('media'))
            if app['type'] == 'hive.code':
                data.update(dfilter(app, ['content', 'url']))
            if app['type'] == 'hive.image':
                data.update(dfilter(app, ['url']))
            if data:
                data['type'] = app['type']
                client_data[app_id] = data
        tdata.context.update(client_data=client_data)
        return self.serve_page(tdata, response, 'pages/expr.html')
        
    def expr_to_html(self, exp, snapshot_mode=False, viewport=(1000, 750)):
        """Converts JSON object representing an expression to HTML"""

        if not exp: return ''
        expr_dims = exp.get('dimensions', [1000, 750])
        # TODO-feature-expr-orientation (use y)
        expr_scale = float(viewport[0]) / expr_dims[0]

        html_for_app = partial(self.html_for_app, scale=expr_scale,
            snapshot_mode=snapshot_mode)
        app_html = map(html_for_app, exp.get('apps', []))
        # if exp.has_key('dimensions') and 'gifwall' not in exp.get('tags_index',[]):
        #     app_html.append("<div id='expr_spacer' class='happ' style='top: {}px;'></div>".format(exp['dimensions'][1]))
        return ''.join(app_html)

    def html_for_app(self, app, scale=1, snapshot_mode=False):
        content = app.get('content', '')
        more_css = ''
        dimensions = app.get('dimensions', [100,100])
        type = app.get('type')
        klass = type.replace('.', '_')
        app_id = app.get('id', 'app_' + str(app['z']))

        if type != 'hive.rectangle':
            # rectangles have css as their content; all other apps have extra
            # css in 'css_state'
            c = app.get('css_state', {})
            more_css = ';'.join([p + ':' + str(c[p]) for p in c])
        if type == 'hive.image':
            url = app.get('url') or content
            media = self.db.File.fetch(app.get('file_id'))
            if media: url = media.get_resample(dimensions[0] * scale)

            html = "<img src='%s'>" % content
            scale_x = app.get('scale_x')
            if scale_x:
                scale_x *= dimensions[0]
                css = 'width:%fpx' % (scale_x)
                if app.get('offset'):
                    offset = [x * scale_x for x in app.get('offset')]
                    css = '%s;margin-left:%spx;margin-top:%spx' % (
                        css, offset[0], offset[1] )
                html = "<img src='%s' style='%s'>" % (url, css)
            link = app.get('href')
            if link: html = "<a href='%s'>%s</a>" % (link, html)
        elif type == 'hive.sketch':
            html = "<img src='%s'>" % content.get('src')
        elif type == 'hive.rectangle':
            c = app.get('content', {})
            more_css = ';'.join([p + ':' + str(c[p]) for p in c])
            html = ''
        elif type == 'hive.html':
            html_original = '%s' % (app.get('content',''))
            if snapshot_mode:
                def get_embed_img_html(url):
                    ret_html = ''
                    oembed = utils.get_embedly_oembed(url) if url else ''
                    if oembed and oembed.get('thumbnail_url'):
                        ret_html += '<img src="%s"/>' % oembed['thumbnail_url']
                    return ret_html
                html = ''
                error = False
                # Turn embeds in hive.html blocks to static images
                hivehtml = BeautifulSoup(app.get('content',''))
                # Youtube embeds are <object>, and not <iframe>. We handle this
                # special case here.
                for object_tags in hivehtml.find_all('object'):
                    param_tags = object_tags.find_all('param')
                    for param in param_tags:
                        if param.get('name') == 'movie':
                            html += get_embed_img_html(param.get('value'))
                            more_css += ";overflow:hidden"
                if not html:
                    for iframe in hivehtml.find_all('iframe'):
                        html = get_embed_img_html(iframe.get('src'))
                        if not html:
                            error = True
                    if error:
                        html = html_original
            else:
                encoded_content = cgi.escape(app.get('content',''), quote=True)
                html = '%s' % (app.get('content',''))
        elif type == 'hive.polygon':
            html = (
                  "<svg xmlns='http://www.w3.org/2000/svg'"
                + " viewbox='0 0 %f %f" % tuple(dimensions)
                + "'>"
                + "<filter id='%s_blur'" % app_id 
                + " filterUnits='userSpaceOnUse'><feGaussianBlur stdDeviation='"
                + "%f'></filter>" % app.get('blur', 0)
                + "<polygon points='"
                + ' '.join( map( lambda p: "%f %f" % (p[0], p[1]),
                    app.get('points', []) ) )
                + "' style='filter:url(#%s_blur)'/></svg>" % app_id
            )
            style = app.get('style', {})
            more_css = ';'.join([ k+':'+str(v) for k,v in style.items()])
        elif type == 'hive.code':
            ctype = app.get('code_type', 'js')
            if ctype == 'js':
                tag = 'script'
                if app.get('url'):
                    html = "<script src='%s'></script>" % app.get('url')
                else:
                    html = ( "<script>curl(['ui/expression'],function(expr){"
                        + "expr.load_code(%s)" % json.dumps(app.get('content'))
                        + "})</script>" )
            if ctype == 'css':
                tag = 'style'
                # TODO-code-editor: put style tag in head
                html =  "<style id='%s'>%s</style>" % (
                    app_id, app.get('content') )
            return html
        else:
            html = content

        data = " data-angle='" + str(app.get('angle')) + "'" if app.get('angle') else ''
        data += " data-scale='" + str(app.get('scale')) + "'" if app.get('scale') else ''
        return "<div class='happ %s %s' id='%s' style='%s'%s>%s</div>" % (
            type.replace('.', '_'), app.get('css_class', ''), app_id,
            css_for_app(app) + more_css, data, html
        )

# TODO-bug fix resizing after loading by sending pre-scaled expr
# Requires client layout_apps() to use scaled expr dimensions
def css_for_app(app):
    dimensions = app.get('dimensions', [100,100])
    css = {
            'left': app['position'][0]
            , 'top': app['position'][1]
            , 'z-index': app['z']
            , 'width': dimensions[0]
            , 'height': dimensions[1]
            , 'opacity': app.get('opacity', 1)
            , 'font-size': app.get('scale')
            }
    rv = "left: {left}px; top: {top}px; z-index: {z-index}; opacity: {opacity};".format(**css)
    if not app.get('type') == 'hive.raw_html':
        rv += "width: {width}px; height: {height}px; ".format(**css)
    if app.get('scale'):
        rv += "font-size: {font-size}em;".format(**css)
    return rv
