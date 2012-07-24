import base64
from newhive.controllers.shared import *
from newhive.controllers import Application
from newhive import utils, mail
# TODO: handle this in model layer somehow
from pymongo.connection import DuplicateKeyError

class Expression(Application, PagingMixin):
    def edit_frame(self, request, response):
        expr_id = lget(request.path_parts, 1)
        if not expr_id:
            expr = self.db.Expr.new(dfilter(request.args, ['domain', 'name', 'tags']))
            expr['title'] = 'Untitled'
            expr['auth'] = 'public'
            self.db.ActionLog.create(request.requester, "new_expression_edit")
        else:
            expr = self.db.Expr.fetch(expr_id)
            self.db.ActionLog.create(request.requester, "existing_expression_edit", data={'expr_id': expr.id})
        if not (request.requester.logged_in or expr): return self.serve_404(request, response)
        if expr.auth_required(response.user): return self.serve_forbidden(request)

        #show_help = request.requester.get('flags', {}).get('default-instructional', 0) < 1
        #if show_help: request.requester.increment({'flags.default-instructional': 1})

        response.context.update({
             'title'     : 'Editing: ' + expr.get('title')
            #,'editor_url': abs_url(domain = config.content_domain, secure = True) + 'edit/' + expr.id
            ,'expr'      : expr
            #,'show_help' : show_help
            ,'editing'   : True
        })
        return self.serve_page(response, 'pages/edit_tmp.html')

    #def edit_frame(self, request, response):
    #    expr = self.db.Expr.fetch(lget(request.path_parts, 1), meta=True)
    #    if not (request.requester.logged_in or expr): return self.serve_404(request, response)
    #    if expr.auth_required(response.user): return self.serve_forbidden(request)

    #    show_help = request.requester.get('flags', {}).get('default-instructional', 0) < 1
    #    if show_help: request.requester.increment({'flags.default-instructional': 1})

    #    response.context.update({
    #         'title'     : 'Editing: ' + expr.get('title')
    #        ,'editor_url': abs_url(domain = config.content_domain, secure = True) + 'edit/' + expr.id
    #        ,'expr'      : expr
    #        ,'show_help' : show_help
    #        ,'editing'   : True
    #    })
    #    return self.serve_page(response, 'pages/edit_frame.html')

    #def edit(self, request, response):
    #    expr_id = lget(request.path_parts, 1)
    #    if not expr_id:
    #        expr = dfilter(request.args, ['domain', 'name', 'tags'])
    #        expr['title'] = 'Untitled'
    #        expr['auth'] = 'public'
    #        self.db.ActionLog.create(request.requester, "new_expression_edit")
    #    else:
    #        expr = self.db.Expr.fetch(expr_id)
    #        if not expr: return self.serve_404(request, response)
    #        self.db.ActionLog.create(request.requester, "existing_expression_edit", data={'expr_id': expr.id})
    #    response.context.update({ 'expr': expr })
    #    return self.serve_page(response, 'pages/edit.html')

    # destructively prepare state.Expr for client consumption
    def expr_prepare(self, expr, viewer=None, password=None):
        owner = expr.owner
        owner_info = dfilter(owner, ['name', 'fullname', 'tags'])
        owner_info.update({ 'id': owner.id, 'url': owner.url, 'thumb': owner.get_thumb(70), 'has_thumb': owner.has_thumb })

        #expr_info = dfilter(expr, ['thumb', 'title', 'tags', 'tags_index', 'owner',
        #    'owner_name', 'updated', 'name'])
        counts = dict([ ( k, large_number( v.get('count', 0) ) ) for
            k, v in expr.get('analytics', {}).iteritems() ])
        counts['Views'] = large_number(expr.views)
        counts['Comment'] = large_number(expr.comment_count)

        # check if auth is required so we can then strip password
        auth_required = expr.auth_required()
        if expr.auth_required(viewer, password):
            for key in ['password', 'thumb', 'thumb_file_id']: expr.pop(key, None)
            dict.update(expr, {
                 'tags': ''
                ,'background': {}
                ,'apps': []
                ,'title': '[Private]'
                ,'tags_index': []
            })

        dict.update(expr, {
            'id': expr.id,
            'thumb': expr.get_thumb(),
            'owner': owner_info,
            'counts': counts,
            'url': expr.url,
            'auth_required': auth_required
        })

        return expr

    # Controller for all navigation surrounding an expression
    # Must only output trusted HTML
    def frame(self, request, response, parts):
        if request.is_xhr:
            return self.infos(request, response)

        path = '/'.join(parts)
        owner = response.context['owner']
        resource = self.db.Expr.meta(owner['name'], path)
        if not resource:
            if request.path == '': return self.redirect(response, owner.url)
            return self.serve_404(request, response)
        is_owner = request.requester.logged_in and owner.id == request.requester.id
        if resource.get('auth') == 'private' and not is_owner: return self.serve_404(request, response)
        if is_owner: owner.unflag('expr_new')

        expr_url = ( abs_url(domain = config.content_domain)
            + ('empty' if resource.auth_required() else resource.id) )
        self.expr_prepare(resource, response.user)
        response.context.update(
             expr_frame = True
            ,title = resource.get('title', False)
            ,expr = resource
            ,expr_url = expr_url
            ,embed_url = resource.url + querystring(dupdate(request.args, {'template':'embed'}))
            ,content_domain = abs_url(domain = config.content_domain)
            )

        template = resource.get('template', request.args.get('template', 'frame'))

        if request.requester.logged_in:
            self.db.ActionLog.create(request.requester, "view_expression", data={'expr_id': resource.id})

        return self.serve_page(response, 'pages/' + template + '.html')

    def infos(self, request, response):
        args = request.args.copy().to_dict(flat=True)
        current_id = args.get('page')
        tag = args.get('tag')

        special_tags = {
                'Featured': (self.expr_featured, 'id')
                , 'Recent': (self.expr_all, 'updated')
                , 'Network': (self.home_feed, None)
                }

        # Use key_map to map between keys used in querystring and those of database
        spec = utils.key_map(args, {'tag': 'tags_index', 'user': 'owner_name'}, filter=True)
        args = dfilter(args, ['sort', 'page', 'expr', 'order', 'limit'])
        args['viewer'] = request.requester

        default = (None, 'updated')
        pager, paging_attr = special_tags.get(tag, default) if spec else (self.expr_all, 'updated')

        if utils.is_mongo_key(current_id):
            if paging_attr and paging_attr != 'id':
                expr = self.db.Expr.fetch(current_id)
                args['page'] = expr[paging_attr]
            else:
                args['sort'] = '_id'

        if args.has_key('order'): args['order'] = int(args['order'])
        if args.has_key('limit'): args['limit'] = int(args['limit'])

        if pager:
            items_and_args = pager(request, response, args)
            exprs = items_and_args[0] if type(items_and_args) == tuple else items_and_args
        else:
            exprs = self.db.Expr.page(spec, **args)

        return self.serve_json(response, map(lambda e: self.expr_prepare(e, response.user), exprs))

    def info(self, request, response):
        expr = self.db.Expr.fetch(lget(request.path_parts, 1))
        if not expr: return self.serve_404(request, response)
        return self.serve_json( response, self.expr_prepare(
            expr, viewer=response.user, password=request.form.get('password')) )

    # Renders the actual content of an expression.
    # This output is untrusted and must never be served from config.server_name.
    def render(self, request, response):
        expr_id = lget(request.path_parts, 0)
        expr = self.db.Expr.fetch(expr_id)
        if not expr: return self.serve_404(request, response)

        if expr.auth_required() and not expr.cmp_password(request.form.get('password')):
            return self.serve_forbidden(request)

        response.context.update(html = expr_to_html(expr), expr = expr)
        return self.serve_page(response, 'pages/expr.html')

    def empty(self, request, response): return self.serve_page(response, 'pages/expr_empty.html')

    def feed(self, request, response):
        expr = self.db.Expr.fetch(lget(request.path_parts, 1))
        if not expr: return self.serve_404(request, response)
        if expr.auth_required(request.requester, password=request.form.get('password')):
            return self.serve_json(response, [])

        if request.owner == expr.get('owner'): expr.increment_counter('owner_views')
        else: expr.increment_counter('views')

        items = map(lambda item: dict(item,
                initiator_thumb=item.initiator.get_thumb(70),
                created_friendly=friendly_date(item['created'])
            ), expr.feed_page(viewer=request.requester, limit=0))
        return self.serve_json(response, list(items))       

    def random(self, request, response):
        expr = self.db.Expr.random()
        if request.requester.logged_in:
            self.db.ActionLog.create(request.requester, "view_random_expression", data={'expr_id': expr.id})
        return self.redirect(response, expr.url)

    def dialog(self, request, response):
        owner = request.owner
        exp = self.db.Expr.find(dict(owner=owner.id, name=request.path.lower()))
        response.context.update(exp=exp, expr=exp)
        return self.serve_page(response, 'dialogs/' + request.args['dialog'] + '.html')

    def save(self, request, response):
        """ Parses JSON object from POST variable 'exp' and stores it in database.
            If the name (url) does not match record in database, create a new record."""

        try: exp = self.db.Expr.new(json.loads(request.form.get('exp', '0')))
        except: exp = False
        if not exp: raise ValueError('missing or malformed exp')

        res = self.db.Expr.fetch(exp.id)
        upd = dfilter(exp, ['name', 'domain', 'title', 'apps', 'dimensions', 'auth', 'password', 'tags', 'background', 'thumb', 'images'])
        upd['name'] = upd['name'].lower().strip()

        # if user has not picked a thumbnail, pick the latest image added
        thumb_file_id = exp.get('thumb_file_id')
        if thumb_file_id:
            file = self.db.File.fetch(thumb_file_id)
            if file:
                upd['thumb'] = file.get_default_thumb()
                upd['thumb_file_id'] = thumb_file_id
            elif len(thumb_file_id) == 1:
                upd['thumb'] = self.asset("skin/1/thumb_%s.png" % thumb_file_id)
                upd['thumb_file_id'] = None

        # deal with inline base64 encoded images from Sketch app
        for app in upd['apps']:
            if app['type'] != 'hive.sketch': continue
            data = base64.decodestring(app.get('content').get('src').split(',',1)[1])
            f = os.tmpfile()
            f.write(data)
            res = self.db.File.create(dict(owner=request.requester.id, tmp_file=f, name='sketch', mime='image/png'))
            f.close()
            app.update({
                 'type' : 'hive.image'
                ,'content' : res['url']
                ,'file_id' : res.id
            })

        if not exp.id or upd['name'] != res['name'] or upd['domain'] != res['domain']:
            try:
              new_expression = True
              res = request.requester.expr_create(upd)
              self.db.ActionLog.create(request.requester, "new_expression_save", data={'expr_id': res.id})
              request.requester.flag('expr_new')
              if request.requester.get('flags').get('add_invites_on_save'):
                  request.requester.unflag('add_invites_on_save')
                  request.requester.give_invites(5)
            except DuplicateKeyError:
                if exp.get('overwrite'):
                    self.db.Expr.named(request.requester['name'], upd['name']).delete()
                    res = request.requester.expr_create(upd)
                    self.db.ActionLog.create(request.requester, "new_expression_save", data={'expr_id': res.id, 'overwrite': True})
                else:
                    return { 'error' : 'overwrite' } #'An expression already exists with the URL: ' + upd['name']
                    self.db.ActionLog.create(request.requester, "new_expression_save_fail", data={'expr_id': res.id, 'error': 'overwrite'})
        else:
            if not res['owner'] == request.requester.id:
                raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
            res.update(**upd)
            new_expression = False
            self.db.ActionLog.create(request.requester, "update_expression", data={'expr_id': res.id})

        return dict( new = new_expression, error = False, id = res.id, location = res.url )


    def delete(self, request, response):
        e = self.db.Expr.fetch(request.form.get('id'))
        if not e: return self.serve_404(request, response)
        if e['owner'] != request.requester.id: raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
        e.delete()
        # TODO: garbage collect media files that are no longer referenced by expression
        return self.redirect(response, request.requester.url)

    def tag_update(self, request, response):
        tag = lget(normalize(request.form.get('value', '')), 0)
        id = request.form.get('expr_id')
        expr = self.db.Expr.fetch(id)
        if request.requester.id != expr.owner.id and not tag == "starred": return False
        action = request.form.get('action')
        if action == 'tag_add':
            if tag == "starred":
                s = self.db.Star.create(request.requester, expr)
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

    featured = {
            'project': [
                '4f1c4f08ba2839741f0000bf',
                '4f149949ba28397ae300000d',
                '4f1b7691ba283920a6000011',
                '4f040705ba28390a870000e1',
                '4f22dfa4ba283945d9000329',
                '4f186b7fba283929fd000295',
                '4f207c37ba283940b4000013',
                '4f1b8269ba283920a600007b',
                '4f2051abba28394fe900002e',
                '4f2328e5ba2839283f000039',
                '4f1e7aa6ba2839302c0000e4',
                '4f234d79ba28391fe8000115',
                '4f0d0be0ba283909eb000151',
                '4f07b8afba2839255d0000f8',
                '4f1b467bba28390d2b00023f',
                '4f1ddbb5ba283939d5000008',
                '4f1f2ef2ba2839689300001e',
                '4f207176ba28392c34000002',
                '4f206183ba283912bb000029',
                '4f177b04ba28395b0a00016d',
                '4f12533eba283932ae00000d',
                '4f1ddbb5ba283939d5000008',
                '4f1df138ba283939d500009a']
            ,'wish' : [
                '4f247c60ba283927490002b5',
                '4f1c4c3bba283973250000ba',
                '4f1b726eba283920a6000000',
                '4f1a04f3ba283938500000c0',
                '4f186b7fba283929fd000295',
                '4f174437ba28394fc5000320']
            }



# www_expression -> String, this maybe should go in state.Expr
def expr_to_html(exp):
    """Converts JSON object representing an expression to HTML"""

    if not exp: return exp
    apps = exp.get('apps', [])

    def css_for_app(app):
        return "left:%fpx; top:%fpx; width:%fpx; height:%fpx; %sz-index : %d; opacity:%f;" % (
            app['position'][0],
            app['position'][1],
            app['dimensions'][0],
            app['dimensions'][1],
            'font-size : ' + str(app['scale']) + 'em; ' if app.get('scale') else '',
            app['z'],
            app.get('opacity', 1) or 1
            )

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
            html = ""
        else:
            html = content
        data = " data-angle='" + str(app.get('angle')) + "'" if app.get('angle') else ''
        data += " data-scale='" + str(app.get('scale')) + "'" if app.get('scale') else ''
        return "<div class='happ %s' id='app%s' style='%s'%s>%s</div>" %\
            (type.replace('.', '_'), id, css_for_app(app) + more_css, data, html)

    return ''.join(map(html_for_app, apps))

