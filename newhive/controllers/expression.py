import base64, jinja2
from newhive.controllers.shared import *
from newhive.controllers.community import Community
from newhive import utils, mail
# TODO: handle this in model layer somehow
from pymongo.connection import DuplicateKeyError

class Expression(Community, PagingMixin):
    def edit_frame(self, request, response):
        if not request.requester.logged_in: return self.redirect(response, AbsUrl())
        if not request.is_secure: return self.redirect(response, AbsUrl(request.path))
        expr_id = lget(request.path_parts, 1)
        if not expr_id:
            expr = self.db.Expr.new(dfilter(request.args, ['domain', 'name', 'tags']))
            expr['title'] = 'Untitled'
            expr['auth'] = 'public'
            self.db.ActionLog.create(request.requester, "new_expression_edit")
        else:
            expr = self.db.Expr.fetch(expr_id)
            if not expr: return self.serve_404(request, response)
            self.db.ActionLog.create(request.requester, "existing_expression_edit", data={'expr_id': expr.id})
        if expr.auth_required(response.user): return self.serve_forbidden(request)

        #show_help = request.requester.get('flags', {}).get('default-instructional', 0) < 1
        #if show_help: request.requester.increment({'flags.default-instructional': 1})

        response.context.update({
             'title'     : 'Editing: ' + expr.get('title')
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

    # Controller for all navigation surrounding an expression
    # Must only output trusted HTML
    def frame(self, request, response, parts):
        path = '/'.join(parts)
        owner = response.context['owner']
        resource = self.db.Expr.meta(owner['name'], path)
        if not resource:
            if path == '': return self.redirect(response, owner.url)
            return self.serve_404(request, response)
        return self.serve_expression_frame(request, response, resource)

        #is_owner = request.requester.logged_in and owner.id == request.requester.id
        #if resource.get('auth') == 'private' and not is_owner: return self.serve_404(request, response)
        #if is_owner: owner.unflag('expr_new')

        #expr_url = abs_url(domain = config.content_domain) + resource.id
        #self.expr_prepare(resource, response.user)
        #response.context.update(
        #     expr_frame = True
        #    ,title = resource.get('title', False)
        #    ,expr = resource
        #    ,expr_url = expr_url
        #    ,embed_url = resource.url + querystring(dupdate(request.args, {'template':'embed'}))
        #    ,content_domain = abs_url(domain = config.content_domain)
        #    )

        #template = resource.get('template', request.args.get('template', 'frame'))

        #if request.requester.logged_in:
        #    self.db.ActionLog.create(request.requester, "view_expression", data={'expr_id': resource.id})

        #return self.serve_page(response, 'pages/' + template + '.html')

    def serve_expression_frame(self, request, response, resource, template=None):
        owner = resource.owner
        is_owner = request.requester.logged_in and owner.id == request.requester.id
        if resource.get('auth') == 'private' and not is_owner: return self.serve_404(request, response)
        if is_owner: resource.owner.unflag('expr_new')
        expr_url = abs_url(domain = config.content_domain) + resource.id

        response.context.update(
             domain = request.domain
            ,owner = owner
            ,owner_url = owner.url
            ,path = request.path
            ,user_is_owner = request.is_owner
            ,listeners = owner.starrer_page()
            )

        response.context.update(
             expr_frame = True
            ,title = resource.get('title', False)
            ,expr = self.item_prepare(resource, viewer=response.user)
            ,expr_url = expr_url
        )

        template = template or resource.get('template', request.args.get('template', 'frame'))
        return self.serve_page(response, 'pages/' + template + '.html')

    def site_expression(self, request, response):
        if request.requester.logged_in and request.path == '':
            return self.redirect(response, AbsUrl('home/network'))
        expressions = {
                '': ['thenewhive', 'home']
                }
        expr = self.db.Expr.named(*expressions.get(request.path))
        return self.serve_expression_frame(request, response, expr, template="home")

    def info(self, request, response, expr=None):
        expr = expr or self.db.Expr.fetch(lget(request.path_parts, 1))
        if not expr: return self.serve_404(request, response)
        return self.serve_json( response, self.item_prepare(
            expr, viewer=response.user, password=request.form.get('password')) )

    # Renders the actual content of an expression.
    # This output is untrusted and must never be served from config.server_name.
    def render(self, request, response):
        expr_id = lget(request.path_parts, 0)
        expr = self.db.Expr.fetch(expr_id)
        password = request.form.get('password')
        if not expr: return self.serve_404(request, response)

        if expr.auth_required() and not expr.cmp_password(password):
            expr = False
            # return status forbidden so the client knows their password was invalid
            response.status_code = 403

        response.context.update(
                html = self.expr_to_html(expr)
                , expr = expr
                , use_ga = False
                , expr_script = expr.get('script') if expr else ''
                , expr_style = expr.get('style')) if expr else ''
        if request.form.get('partial'):
            return self.serve_page(response, 'pages/expr_content_only.html')
        else:
            return self.serve_page(response, 'pages/expr.html')

    def feed_prepare(self, item):
        item = dict(item,
            initiator_thumb = item.initiator.get_thumb(70),
            created_friendly = friendly_date(item['created'])
        )
        if item.has_key('text'): item['text'] = jinja2.escape(item['text'])
        return item

    def feed(self, request, response):
        expr = self.db.Expr.fetch(lget(request.path_parts, 1))
        if not expr: return self.serve_404(request, response)
        if expr.auth_required(request.requester, password=request.form.get('password')):
            return self.serve_json(response, [])

        if request.owner == expr.get('owner'): expr.increment_counter('owner_views')
        else: expr.increment_counter('views')

        items = map(self.feed_prepare, expr.feed_page(viewer=request.requester, limit=0))
        return self.serve_json(response, list(items))       

    def random(self, request, response):
        expr = self.db.Expr.random()
        if request.requester.logged_in:
            self.db.ActionLog.create(request.requester, "view_random_expression", data={'expr_id': expr.id})
        if request.is_json:
            return self.info(request, response, expr)
        else:
            return self.redirect(response, expr.url + querystring({ 'q': '#All' }))

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
        allowed_attributes = ['name', 'domain', 'title', 'apps', 'dimensions', 'auth', 'password'
                              , 'tags', 'background', 'thumb', 'images']
        if request.requester.is_admin:
            allowed_attributes.extend(['fixed_width', 'script', 'style'])
        upd = dfilter(exp, allowed_attributes)
        upd['name'] = upd['name'].lower().strip('/ ')

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
            file_res = self.db.File.create(dict(owner=request.requester.id, tmp_file=f, name='sketch', mime='image/png'))
            f.close()
            app.update({
                 'type' : 'hive.image'
                ,'content' : file_res['url']
                ,'file_id' : file_res.id
            })

        if not res or upd['name'] != res['name'] or upd['domain'] != res['domain']:
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

            self.db.UpdatedExpr.create(res.owner, res)
            self.db.ActionLog.create(request.requester, "update_expression", data={'expr_id': res.id})

        return dict( new = new_expression, error = False, id = res.id, location = res.url + "?user=" + res['owner_name'])


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
