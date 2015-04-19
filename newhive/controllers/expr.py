import os, json, cgi, base64, re, time
from pymongo.errors import DuplicateKeyError
from functools import partial
from collections import deque
import urllib

from newhive.utils import (dfilter, now, tag_string, is_number_list, URL, lget,
    abs_url)
from newhive.controllers.controller import ModelController

def anchor_tag(link, name, xlink=False):
    xlink = "xlink:" if xlink else ""
    link = xlink + 'href="' + link + '" ' if link else ''
    name = xlink + 'name="' + name + '" ' if name else ''
    return link + name

class Expr(ModelController):
    model_name = 'Expr'

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

    def expr_custom_domain(self, tdata, request, response, path='', **args):
        url = request.host + ('/' if path else '') + path
        expr = self.db.Expr.find({'url': url})
        tdata.context['domain'] = request.host
        return self.serve_naked(tdata, request, response, expr)

    def serve_naked(self, tdata, request, response, expr_obj):
        if not expr_obj: return self.serve_404(tdata)

        bg = expr_obj.get('background')
        if bg and bg.get('file_id') and not bg.get('dimensions'):
            f = self.db.File.fetch(bg.get('file_id'))
            dimensions = f.get('dimensions')
            if dimensions:
                bg['dimensions'] = dimensions
                expr_obj.update(updated=False, background=bg)
            else:
                f.update(resample_time=0)
        if (expr_obj.get('auth') == 'password'
            and not expr_obj.cmp_password(request.form.get('password'))
            and not expr_obj.cmp_password(request.args.get('pw'))):
            expr_obj = { 'auth': 'password' }
            expr_client = expr_obj
        else:
            expr_client = expr_obj.client_view(mode='page')
        # TODO: consider allowing analytics for content frame.
        viewport = [int(x) for x in
            request.args.get('viewport', '1000x750').split('x')]
        snapshot_mode = request.args.get('snapshot') is not None
        tdata.context.update(
            html = self.expr_to_html(expr_obj, snapshot_mode,
                viewport=viewport),
            expr = expr_obj,
            use_ga = False,
        )

        body_style = ''
        if snapshot_mode:
            body_style = 'overflow: hidden;'
        if expr_obj.get('clip_x'):
            body_style = 'overflow-x: hidden;'
        if expr_obj.get('clip_y'):
            body_style += 'overflow-y: hidden;'
        if body_style:
            tdata.context['css'] = 'body {' + body_style + '}'

        tdata.context.update(expr=expr_obj, expr_client=expr_client)
        return self.serve_page(tdata, 'pages/expr.html')

    def embed(self, tdata, request, response, expr_id=None, **args):
        expr = self.db.Expr.fetch(expr_id)
        if not expr: return self.serve_404(tdata)
        tdata.context.update(expr=expr, embed=True,
            content_url=abs_url(domain=self.config.content_domain, 
                secure=tdata.request.is_secure) + expr.id)
        return self.serve_page(tdata, 'pages/embed.html')

    def save(self, tdata, request, response, **args):
        """ Parses JSON object from POST variable 'exp' and stores it in database.
            If the name (url) does not match record in database, create a new record."""

        autosave = (request.form.get('autosave') == "1")

        try: expr = self.db.Expr.new(json.loads(request.form.get('expr', '0')))
        except: expr = False
        if not expr: raise ValueError('Missing or malformed expr')

        # Name of the expression before rename
        orig_name = expr.get('orig_name')
        res = self.db.Expr.fetch(expr.id)
        allowed_attributes = [
            'name', 'url', 'title', 'apps', 'dimensions', 'auth', 'password',
            'tags', 'background', 'thumb', 'images',
            'value', 'remix_value', 'remix_value_add',
            'container', 'clip_x', 'clip_y', 'layout_coord', 'groups', 'globals'
        ]
        # TODO: fixed expressions, styles, and scripts, need to be done right
        # if tdata.user.is_admin:
        #     allowed_attributes.extend(['fixed_width', 'script', 'style'])
        upd = dfilter(expr, allowed_attributes)
        upd['name'] = upd.get('name','').lower().strip('/ ')
        draft = res and (res.get('draft') == True)
        if draft and orig_name:
            res['name'] = upd['name']

        # Create data and upload to s3
        # TODO: proper versioning
        def module_names(app):
            """ Returns: comma-separated lists of module names """
            names = [m.get('name') for m in app.get('modules')]
            return ",".join([""] + names)
        def module_modules(app):
            """ Returns: comma-separated lists of module imports """
            def path(module):
                path = module.get('path')
                for app in upd.get('apps', []):
                    if path == app.get('id') or path == app.get('name'):
                        path = app.get('file_id')
                        if not path:
                            raise "Not found"
                        path = 'media/' + path
                        break
                return path
            try:
                names = ["'" + path(m) + "'" for m in app.get('modules')]
            except Exception, e:
                return False
            return ",".join([""] + names)

        apps = deque(upd.get('apps',[]))
        while len(apps):
            # extract files from sketch and code objects
            app = apps.popleft()
            ok = True
            data = None
            suffix = ""
            file_id = app.get('file_id')
            if app['type'] == 'hive.code' and app['code_type'] == 'js':
                data = app.get('content')
                modules = module_modules(app)
                ok = ok and file_id and (modules != False)
                if ok:
                    # expand to full module code
                    data = ("define(['browser/jquery'%s], function($%s"
                        + ") {\nvar self = {}\n%s\nreturn self\n})"
                    ) % (modules, module_names(app), data)
                name = "code"
                mime = "application/javascript"
                suffix = ".js"
            elif app['type'] == 'hive.sketch': 
                # deal with inline base64 encoded images from Sketch app
                data = base64.decodestring(app.get('content').get('src').split(',',1)[1])
                name = 'sketch',
                mime = 'image/png'

            if not data:
                continue
            if not ok:
                # dependencies not visited
                apps.append(app)

            # sync files to s3
            f = os.tmpfile()
            f.write(data)
            file_res = None
            # TODO-feature-versioning goes here
            # If file exists, overwrite it
            if file_id:
                file_res = self.db.File.fetch(file_res)
            if file_res:
                file_res.update_file(f)
            else:
                file_res = self.db.File.create(dict(
                    owner=tdata.user.id
                    ,tmp_file=f
                    ,name=name
                    ,mime=mime
                    ,suffix=suffix
                ))
            f.close()
            app_upd = {'file_id' : file_res.id}
            if app['type'] == 'hive.code':
                app_upd.update({'code_url' : file_res.url })
            elif app['type'] == 'hive.sketch': 
                app_upd.update({'type' : 'hive.image'
                    ,'content' : file_res.url })
            app.update(app_upd)

        def record_expr_save(res):
            self.db.ActionLog.create(tdata.user, "new_expression_save",
                data={'expr_id': res.id})
            tdata.user.flag('expr_new')

        duplicate = False
        if not res or upd['name'] != res['name']:
            """ we're creating a new page """
            if autosave:
                # TODO-autosave: create anonymous expression
                if upd.get('name','') == '':
                    upd['name'] = self.db.Expr.unused_name( tdata.user,
                        time.strftime("%Y_%m_%d") )
                upd['auth'] = "private"
                upd['tags'] += " #draft"
                upd['draft'] = True
                res = tdata.user.expr_create(upd)
                return self.serve_json(response, { "autosave": 1, "expr": res })

            # remix: ensure that the remixed tag is saved with a remix
            if upd.get('remix_parent_id'):
                upd['tags'] += " #remixed" # + remix_name

            try:
                res = tdata.user.expr_create(upd)
            except DuplicateKeyError:
                duplicate = True
            else:
                record_expr_save(res)
        else:
            """ we're updating a page """
            if not res['owner'] == tdata.user.id:
                raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')

            if autosave:
                if draft:
                    upd['auth'] = 'password'
                    res.update(**upd)
                else:
                    upd['updated'] = now()
                    res.update(updated=False, draft=upd)
                return self.serve_json(response, { 'autosave': 1 } )

            if draft: upd['draft'] = False
            try:
                res.update(**upd)
            except DuplicateKeyError:
                duplicate = True
            else:                    
                self.db.UpdatedExpr.create(res.owner, res)
                self.db.ActionLog.create(tdata.user, "update_expression", data={'expr_id': res.id})

        def rename_error():
            return self.serve_json(response, { 'error' : 'rename',
                'rename_existing': self.db.Expr.unused_name(
                    tdata.user, upd['name'] ),
                'name_existing': upd['name']
            })

        if duplicate:
            if expr.get('rename_existing'):
                existing = self.db.Expr.named(tdata.user['name'], upd['name'])
                try:
                    existing.update( updated=False,
                        name=expr.get('rename_existing') )
                    res = tdata.user.expr_create(upd)
                except DuplicateKeyError:
                    return rename_error()
                else:
                    record_expr_save(res)
            else:
                return rename_error()

        # autosave: Remove "draft" on first save
        if draft and not autosave:
            new_tags = res['tags_index']
            if "draft" in new_tags: new_tags.remove("draft")
            res.update(tags=tag_string(new_tags))

        if( not self.config.snapshot_async
            and ( upd.get('apps') or upd.get('background') )
        ): res.threaded_snapshot(retry=120)
        # TODO-cleanup: create client_view for full expression record, instead
        # of just feed cards
        res['id'] = res.id

        return self.serve_json(response, res)

    # the whole editor except the save dialog and upload code goes in sandbox
    def editor_sandbox(self, tdata, request, response, **args):
        return self.serve_page(tdata, 'pages/edit_sandbox.html')

    def unused_name(self, tdata, request, response, **args):
        """ Returns an unused newhive name matching the base name provided """
        resp = {}
        name = request.form.get("name") or request.args.get("name","")
        owner_id = request.form.get("owner_id") or request.args.get("owner_id", "")
        owner = self.db.User.fetch(owner_id)

        resp['name'] = self.db.Expr.unused_name(owner, name)
        return self.serve_json(response, resp)
    
    def remix(self, tdata, request, response, **args):
        parent_id = request.form.get('expr_id')
        parent = self.db.Expr.fetch(parent_id)
        if not parent:
            return self.serve_500(tdata, 'missing')
        if 'remix' not in parent.get('tags_index', []):
            return self.serve_500(tdata, 'not_remixable')
        if parent.get('remix_value', 0) > tdata.user.get('moneys_sum', 0):
            return self.serve_json(tdata.response, dict(error='funds'))
        remixed = tdata.user.expr_remix(parent)
        return self.serve_json(tdata.response, dict(remixed=True,
            expr_id=remixed.id, name=remixed['name']))

    def to_image(self, tdata, request, response, expr_id, **args):
        expr_obj = self.db.Expr.fetch(expr_id)
        if expr_obj.private and tdata.user.id != expr_obj.owner.id:
	    return self.serve_404(tdata, request, response, json=True)

        if expr_obj.threaded_snapshot(full_page = True, time_out = 30):
            return self.redirect(response, expr_obj.snapshot_name('full'))

        return self.serve_500(tdata, 'timeout')

    def delete(self, tdata, request, response, **args):
        resp = {}
        expr_id = request.form.get("expr_id")

        expr = self.db.Expr.fetch(expr_id)
        if not expr:
            resp = { 'error': 'Newhive not found.' }
            return self.serve_json(response, resp)
        
        expr.delete()

        return self.serve_json(response, resp)

    def snapshot_redirect(self, tdata, request, response, expr_id, **args):
        expr_obj = self.db.Expr.fetch(expr_id)
	
    # def fetch_data(self, tdata, request, response, expr_id=None, **args):
    #     expr = self.db.Expr.fetch(expr_id)
    #     if not expr or (
    #         (not tdata.user.can_view(expr)) and expr.get('password')
    #     ): return None

    #     # editor currently depends on URL attribute
    #     apps = expr.get('apps', [])
    #     for a in apps:
    #         # print 'app ', a
    #         file_id = a.get('file_id') 
    #         if file_id and not a.get('url'):
    #             # print (self.db.File.fetch(file_id) or {}).get('url')
    #             a['url'] = (self.db.File.fetch(file_id) or {}).get('url')
    #     expr['id'] = expr.id

    #     return self.serve_json(response, expr)

    def expr_to_html(self, exp, snapshot_mode=False, viewport=(1000, 750)):
        """Converts JSON object representing an expression to HTML"""
        if not exp: return ''
        # scale the objects on this page based on the given viewport
        expr_scale = float(viewport[exp.get('layout_coord', 0)]) / 1000

        html_for_app = partial(self.html_for_app, scale=expr_scale,
            snapshot_mode=snapshot_mode)
        app_html = map(html_for_app, exp.get('apps', []))
        return ''.join(app_html)

    def html_for_app(self, app, scale=1, snapshot_mode=False):
        content = app.get('content', '')
        more_css = ''
        data = []
        dimensions = app.get('dimensions', [100,100])
        if not is_number_list(dimensions, 2): return ''
        if not is_number_list(app.get('position', []), 2): return ''

        for prop in ['angle', 'scale']:
            if app.get(prop): data.append(("data-" + prop, app.get(prop)))
        
        type = app.get('type')
        klass = type.replace('.', '_')
        app_id = app.get('id', 'app_' + str(app['z']))
        link = app.get('href')
        link_name = app.get('href_name')
        if type == 'hive.circle':
            type = 'hive.rectangle'

        if type != 'hive.rectangle':
            # rectangles have css as their content; all other apps have extra
            # css in 'css_state'
            c = app.get('css_state', {})
            more_css = ';'.join([p + ':' + str(c[p]) for p in c])
        if type == 'hive.image':
            url = app.get('url') or content
            media = self.db.File.fetch(app.get('file_id'))
            scale_x = app.get('scale_x', 1)
            if media: 
                data.append(("data-orig", url))
                url = media.get_resample(dimensions[0] * scale * scale_x)
                if not snapshot_mode: #//!! and self.flags.get('lazy_load'):
                    data.append(("data-scaled", url))
                    scale /= 8.0 #//!!self.flags.get('lazy_load_scale'):
                    url = (media.get_static_url() or 
                        media.get_resample(dimensions[0] * scale * scale_x))

            html = "<img src='%s'>" % url
            if scale_x:
                klass += " crop_box"
                scale_x *= dimensions[0]
                css = 'width:%fpx' % (scale_x)
                offset = app.get('offset')
                if is_number_list(offset, 2):
                    offset = [x * scale_x for x in offset]
                    css = '%s;margin-left:%spx;margin-top:%spx' % (
                        css, offset[0], offset[1] )
                html = "<img src='%s' style='%s' class='content'>" % (url, css)
        elif type == 'hive.sketch':
            html = "<img src='%s' class='content'>" % content.get('src')
        elif type == 'hive.rectangle':
            c = app.get('content', {})
            container_attrs = ['position']
            css = ';'.join([p + ':' + str(c[p]) for p in c if p not in container_attrs])
            more_css = ';'.join([p + ':' + str(c[p]) for p in c if p in container_attrs])

            html = "<div style='%s' class='content'></div>" % css
        elif type == 'hive.html':
            html_original = '%s' % (app.get('content',''))
            encoded_content = cgi.escape(app.get('content',''), quote=True)
            html = '%s' % (app.get('content',''))
        elif type == 'hive.polygon':
            link_text = ('','')
            if link or link_name: 
                link_text = ("<a %s>" % anchor_tag(link, link_name, True),"</a>")

            points = filter(lambda point: is_number_list(point, 2)
                ,app.get('points', []))
            # shouldn't style go into .content, not the .happ as was earlier?
            style = app.get('style', {})
            # TODO: fill in this list
            css_not_for_svg = ['position']
            css = ';'.join([ k+':'+str(v) for k,v in style.items() if 
                k not in css_not_for_svg])
            html = (
                  "<svg xmlns='http://www.w3.org/2000/svg'"
                + " xmlns:xlink='http://www.w3.org/1999/xlink'"
                + " viewbox='0 0 %f %f" % tuple(dimensions)
                + "' style='%s'>" % css
                + "<filter id='%s_blur'" % app_id 
                + " filterUnits='userSpaceOnUse'><feGaussianBlur stdDeviation='"
                + "%f'></filter>" % app.get('blur', 0)
                + "%s<polygon class='content' points='" % link_text[0]
                + ' '.join(map(lambda p: "%f %f" % (p[0], p[1]), points))
                + "' style='filter:url(#%s_blur)'/>%s</svg>" % (
                    app_id, link_text[1])
            )
        elif type == 'hive.code':
            ctype = app.get('code_type', 'js')
            if ctype == 'js':
                tag = 'script'
                if app.get('url'):
                    html = "<script src='%s'></script>" % app.get('url')
                elif app.get('file_id'):
                    html = ( "<script>curl(['ui/expression'],function(expr){"
                        + "expr.load_code_url('%s')" % ('media/' + app.get('file_id'))
                        + "})</script>" )
                else:
                    html = ( "<script>curl(['ui/expression'],function(expr){"
                        + "expr.load_code(%s,%s)" % (json.dumps(app.get('content')),
                            json.dumps(app.get('modules', [])))
                        + "})</script>" )
            if ctype == 'css':
                tag = 'style'
                # TODO-code-editor: put style tag in head
                html =  "<style id='%s'>%s</style>" % (
                    app_id, app.get('content') )
            return html
        elif type == 'hive.text':
            html = "<div class='content'>%s</div>" % content
        else:
            html = "<div class='content'>%s</div>" % content

        if type != 'hive.polygon':
            if link or link_name:
                html = "<a %s>%s</a>" % (anchor_tag(link, link_name), html)

        data = [prop + "=" + str(val) for (prop, val) in data]
        html = "<div class='happ %s %s loading' id='%s' style='%s'%s>%s</div>" % (
            klass, app.get('css_class', ''), app_id,
            css_for_app(app) + more_css, " ".join(data), html
        )

        return html

    def oembed(self, tdata, request, response, **args):
        format = request.args.get('format', 'json')
        if format != 'json':
            return self.serve_500(request, response, status=501)

        url = URL(request.args.get('url'))
        params = url.query
        user_and_page = url.path[1:].split('/', 1)
        user = lget(user_and_page, 0)
        page = lget(user_and_page, 1, '')
        r = self.db.Expr.named(user, page)
        if not r: return self.serve_404(tdata)
        if r['auth'] == 'password':
            return self.serve_forbidden(tdata, request, response, status=401)
            type (required)

        resp = dict(
            title=r.get('title', r.get('name', '')),
            author_name=r['owner_name'],
            author_url=r.owner.url
        )

        # ultra snapshot doesn't exist on any old page
        max_w = min(715, int(request.args.get('maxwidth', 715)))
        max_h = min(430, int(request.args.get('maxheight', 430)))
        size = r.snapshot_max_size(max_w, max_h)
        dims = r.snapshot_dims(size)
        if size:
            snapshot = r.snapshot_name_http(size=size)
            resp.update(
                type='rich', version='1.0',
                thumbnail_url=snapshot,
                thumbnail_width=dims[0],
                thumbnail_height=dims[1],
                width=dims[0],
                height=dims[1]
            )
            if request.args.get('template', 'iframe') == 'iframe':
                # default click to play view
                params['viewport'] = '{0}x{1}'.format(*dims)
                resp.update( html=("<iframe src='{0}?{1}' " +
                    "width='{2}' height='{3}'></iframe>"
                ).format(r.url, urllib.urlencode(params), *dims) )
            else:
                # linked snapshot img
                target = request.args.get('link_target', '_new')
                resp.update( html=("<a href='{0}?{1}' target='{2}'><img " +
                    "src='{3}' width='{4}' height='{5}'></a>"
                    ).format(r.url, urllib.urlencode(params), target, snapshot,
                        *dims)
                )
        else:
            # uh-oh, missing snapshot, give a simple link
            resp.update(type='link')

        return self.serve_json(response, resp)

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
