import base64
from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from newhive import utils, mail
# TODO: handle this in model layer somehow
from pymongo.connection import DuplicateKeyError

class ExpressionController(ApplicationController):

    def edit(self, request, response):
        if not request.requester.logged_in: return self.serve_404(request, response)

        exp_id = lget(request.path.split('/'), 1) #TODO: remove this hack once full routing is in place
        if not exp_id:
            exp = { 'domain' : lget(request.requester.get('sites'), 0) }
            exp.update(dfilter(request.args, ['domain', 'name', 'tags']))
            exp['title'] = 'Untitled'
            exp['auth'] = 'public'
            self.db.ActionLog.create(request.requester, "new_expression_edit")
        else:
            exp = self.db.Expr.fetch(exp_id)
            if not exp: return self.serve_404(request, response)
            self.db.ActionLog.create(request.requester, "existing_expression_edit", data={'expr_id': exp.id})

        if request.requester.get('flags'):
            show_help = request.requester['flags'].get('default-instructional') < 1
        else: show_help = True
        if show_help:
            request.requester.increment({'flags.default-instructional': 1})
        response.context.update({
             'title'     : 'Editing: ' + exp['title']
            ,'sites'     : request.requester.get('sites')
            ,'exp_js'    : re.sub('</script>', '<\\/script>', json.dumps(exp))
            ,'exp'       : exp
            ,'show_help' : show_help
            ,'editing'   : True
        })
        return self.serve_page(response, 'pages/edit.html')

    def show(self, request, response):
        owner = response.context['owner']
        resource = self.db.Expr.find(dict(domain=request.domain, name=request.path.lower()))
        if not resource:
            if request.path == '': return self.redirect(response, owner.url)
            return self.serve_404(request, response)

        is_owner = request.requester.logged_in and owner.id == request.requester.id
        if resource.get('auth') == 'private' and not is_owner: return self.serve_404(request, response)

        if is_owner: owner.unflag('expr_new')

        if request.args.has_key('tag') or request.args.has_key('user'):
            response.context.update(pagethrough = self._pagethrough(request, response, resource))

        html = expr_to_html(resource)
        auth_required = (resource.get('auth') == 'password' and resource.get('password')
            and request.form.get('password') != resource.get('password')
            and request.requester.id != resource['owner'])
        response.context.update(
             edit = abs_url(secure = True) + 'edit/' + resource.id
            ,mtime = friendly_date(time_u(resource['updated']))
            ,title = resource.get('title', False)
            ,starrers = resource.starrer_page()
            ,auth_required = auth_required
            ,body = html
            ,exp = resource
            ,exp_js = json.dumps(resource)
            ,embed_url = resource.url + querystring(dupdate(request.args, {'template':'embed'}))
            )

        resource.increment_counter('views')
        if is_owner: resource.increment_counter('owner_views')

        template = resource.get('template', request.args.get('template', 'expression'))

        if request.requester.logged_in:
            self.db.ActionLog.create(request.requester, "view_expression", data={'expr_id': resource.id})

        if template == 'none':
            if auth_required: return Forbidden()
            return self.serve_html(response, html)

        else: return self.serve_page(response, 'pages/' + template + '.html')

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
                upd['thumb'] = "/lib/skin/1/thumb_%s.png" % (thumb_file_id)
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
                    self.db.Expr.named(upd['domain'], upd['name']).delete()
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
        return dict( new=new_expression, error=False, id=res.id, location=abs_url(domain = upd['domain']) + upd['name'] )


    def delete(self, request, response):
        e = self.db.Expr.fetch(request.form.get('id'))
        if not e: return self.serve_404(request, response)
        if e['owner'] != request.requester.id: raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
        e.delete()
        # TODO: garbage collect media files that are no longer referenced by expression
        return self.redirect(response, request.requester.url)


    def add_comment(self, request, response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'x-requested-with')
        commenter = request.requester
        expression = self.db.Expr.fetch(request.form.get('expression'))
        comment_text = request.form.get('comment')
        comment = self.db.Comment.create(commenter, expression, {'text': comment_text})
        if comment.initiator.id != expression.owner.id:
            mail.mail_feed(self.jinja_env, comment, expression.owner)
        response.context['comment'] = comment
        return self.serve_page(response, 'partials/comment.html')

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

    def _pagethrough(self, request, response, resource):
        pagethrough = {'next': None, 'prev': None}
        shared_spec = {}
        url_args = {}
        root = self.db.User.get_root()
        loop = False
        user = request.args.get('user')
        if user:
            loop = True
            shared_spec.update({'owner_name': request.args.get('user')})
            url_args.update({'user': user})
        if request.args.has_key('tag'):
            tag = request.args.get('tag', '')
            root_tags = root.get('tagged', {})
            if root_tags.has_key(tag):
                ids = root_tags.get(tag, [])
                shared_spec = ids
            else:
                tag = normalize(tag)[0]
                if tag in ['recent']: shared_spec = {}
                else:  shared_spec.update({'tags_index': tag})
            url_args.update({'tag': tag})
        pagethrough['next'] = resource.related_next(shared_spec, loop=loop)
        pagethrough['prev'] = resource.related_prev(shared_spec, loop=loop)

        if pagethrough['next']: pagethrough['next'] = pagethrough['next'].url + querystring(url_args)
        if pagethrough['prev']: pagethrough['prev'] = pagethrough['prev'].url + querystring(url_args)

        return pagethrough

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
        html = ''
        if app.get('type') == 'hive.image':
            html = "<img src='%s'>" % content
            link = app.get('href')
            if link: html = "<a href='%s'>%s</a>" % (link, html)
        elif app.get('type') == 'hive.sketch':
            html = "<img src='%s'>" % content.get('src')
        elif app.get('type') == 'hive.rectangle':
            c = app.get('content', {})
            more_css = ';'.join([p + ':' + str(c[p]) for p in c])
        #elif app.get('type') == 'hive.audio':
        #    html = "<div class='app_hive_audio'>" + content + "</div>"
        else: html = content
        data = " data-angle='" + str(app.get('angle')) + "'" if app.get('angle') else ''
        data += " data-scale='" + str(app.get('scale')) + "'" if app.get('scale') else ''
        return "<div class='happ' style='%s'%s>%s</div>" % (css_for_app(app) + more_css, data, html)

    return ''.join(map(html_for_app, apps))
