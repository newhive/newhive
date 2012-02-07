import base64
from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
import newhive.mail
from newhive import state
# TODO: handle this in model layer somehow
from pymongo.connection import DuplicateKeyError

class ExpressionController(ApplicationController):

    def edit(self, request, response):
        if not request.requester.logged_in: return self.serve_404()

        exp_id = lget(request.path.split('/'), 1) #TODO: remove this hack once full routing is in place
        if not exp_id:
            exp = { 'domain' : lget(request.requester.get('sites'), 0) }
            exp.update(dfilter(request.args, ['domain', 'name', 'tags']))
            exp['title'] = 'Untitled'
            exp['auth'] = 'public'
            self.db.ActionLog.new(request.requester, "new_expression_edit")
        else:
            exp = self.db.Expr.fetch(exp_id)
            self.db.ActionLog.new(request.requester, "existing_expression_edit", data={'expr_id': exp.id})

        if not exp: return self.serve_404(request, response)

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

        response.context['starrers'] = map(self.db.User.fetch, resource.starrers)
        response.context['listeners'] = map(self.db.User.fetch, owner.starrers)

        if request.args.has_key('tag') or request.args.has_key('user'):
            response.context.update(pagethrough = self._pagethrough(request, response, resource))

        html = self._expr_to_html(resource)
        auth_required = (resource.get('auth') == 'password' and resource.get('password')
            and request.form.get('password') != resource.get('password')
            and request.requester.id != resource['owner'])
        response.context.update(
             edit = abs_url(secure = True) + 'edit/' + resource.id
            ,mtime = friendly_date(time_u(resource['updated']))
            ,title = resource.get('title', False)
            ,auth_required = auth_required
            ,body = html
            ,exp = resource
            ,exp_js = json.dumps(resource)
            )

        resource.increment_counter('views')
        if is_owner: resource.increment_counter('owner_views')

        template = resource.get('template', request.args.get('template', 'expression'))

        if request.requester.logged_in:
            self.db.ActionLog.new(request.requester, "view_expression", data={'expr_id': resource.id})

        if template == 'none':
            if auth_required: return Forbidden()
            return self.serve_html(response, html)

        else: return self.serve_page(response, 'pages/' + template + '.html')

    def random(self, request, response):
        expr = self.db.Expr.random()
        if request.requester.logged_in:
            self.db.ActionLog.new(request.requester, "view_random_expression", data={'expr_id': expr.id})
        return self.redirect(response, expr.url)

    def dialog(self, request, response):
        owner = response.context['owner']
        exp = self.db.Expr.find(dict(owner=owner.id, name=request.path.lower()))
        response.context.update(exp=exp, expr=exp)
        return self.serve_page(response, 'dialogs/' + request.args['dialog'] + '.html')

    def search(self, request, response, args={}):
        query = request.args.get('q')
        request, response = self._homepage(request, response, args)
        results = self.db.KeyWords.text_search(query, doc_type='Expr')
        ids = [res['doc'] for res in results]
        expressions = self._expr_list(ids, requester=request.requester.id)
        results = self.db.KeyWords.text_search(query, doc_type='User')
        ids = [res['doc'] for res in results]
        users = self.db.User.list({'_id': {'$in': ids}})
        self.db.ActionLog.new(request.requester, "search", data={'query': query, 'result_size': len(expressions)})
        response.context['exprs'] = expressions
        response.context['users'] = users
        response.context['tag'] = {}
        response.context['title'] = "Results for: " + query
        response.context['query'] = query
        response.context['pages'] = 1
        return self.serve_page(response, 'pages/tag_search.html')

    def index(self, request, response, args={}):
        if args.get('owner'):
            return self._user_index(request, response, args)
        else:
            return self._site_index(request, response, args)

    def _user_index(self, request, response, args={}):
        owner = response.context['owner']
        is_owner = request.requester.logged_in and owner.id == request.requester.id

        page = int(request.args.get('page', 0))
        tags = owner.get('tags', [])
        expressions_tag = {'url': '/expressions', 'name': 'Expressions', 'show_name': False}
        feed_tag = {'url': "/feed", "name": "Feed"}
        star_tag = {'name': 'Starred', 'url': "/starred", 'img': "/lib/skin/1/star_tab" + ("-down" if request.path == "starred" else "") + ".png"}
        people_tag = {'name': 'Listening', 'url': "/listening", 'img': "/lib/skin/1/people_tab" + ("-down" if request.path == "listening" else "") + ".png" }
        response.context['system_tags'] = [expressions_tag, people_tag, star_tag]
        response.context['expr_context'] = {'user': owner.get('name')}

        if request.path.startswith('expressions'):
            spec = { 'owner' : owner.id }
            tag = lget(request.path.split('/'), 1, '')
            if tag:
                response.context['expr_context'].update({'tag': tag})
                tag = {'name': tag, 'url': "/expressions/" + tag, 'type': 'user'}
                spec['tags_index'] = tag['name']
            else: tag = expressions_tag
            response.context['exprs'] = self._expr_list(spec, requester=request.requester.id, page=page, context_owner=owner.id)
        elif request.path == 'starred':
            spec = {'_id': {'$in': owner.starred_items}}
            tag = star_tag
            response.context['exprs'] = self._expr_list(spec, requester=request.requester.id, page=page, context_owner=owner.id)

        response.context['title'] = owner['fullname']
        response.context['tag'] = tag
        response.context['tags'] = map(lambda t: {'url': "/expressions/" + t, 'name': t, 'type': 'user'}, tags)
        if request.requester.logged_in and is_owner:
            response.context['system_tags'].insert(1, feed_tag)
        response.context['profile_thumb'] = owner.thumb
        response.context['starrers'] = map(self.db.User.fetch, owner.starrers)

        return self.serve_page(response, 'pages/expr_cards.html')

    def _homepage(self, request, response, args={}):
        tag = args.get('tag')
        p1 = args.get('p1')
        featured_tags = self.db.User.site_user['config']['featured_tags']
        tags = self.db.User.get_root().get('tags', [])
        response.context['system_tags'] = map(lambda t: {'url': "/home/" + t, 'name': t}, tags)
        people_tag = {'url': '/people', 'name': 'People'}
        response.context['system_tags'].append(people_tag)
        response.context['tags'] = [{'url': '/tag/' + t, 'name': t} for t in featured_tags ]
        if p1 == 'people':
            response.context['tag'] = people_tag
        return [request, response]

    def _site_index(self, request, response, args={}):
        tag = args.get('tag')
        p1 = args.get('p1')
        request, response = self._homepage(request, response, args)
        if p1 == 'people':
            cname = 'user'
        else:
            cname = 'expr'
        self._expr_home_list(args.get('tag'), request, response, cname=cname)
        if tag: response.context['expr_context'] = {'tag': tag }
        elif p1 == '':
            response.context['expr_context'] = {'tag': 'Featured'}
        if p1 == 'tag':
            response.context['exprs'] = self._expr_list({'tags_index':tag.lower()}, page=int(request.args.get('page', 0)), limit=90)
            response.context['tag'] = tag
            response.context['title'] = "#" + tag
        if request.args.get('partial'): return self.serve_page(response, 'page_parts/cards.html')
        elif p1 == 'tag': return self.serve_page(response, 'pages/tag_search.html')
        else:
            return self.serve_page(response, 'pages/home.html')


    def save(self, request, response):
        """ Parses JSON object from POST variable 'exp' and stores it in database.
            If the name (url) does not match record in database, create a new record."""

        try: exp = self.db.Expr.new(json.loads(request.form.get('exp', '0')))
        except: exp = False
        if not exp: raise ValueError('missing or malformed exp')

        res = self.db.Expr.fetch(exp.id)
        upd = dfilter(exp, ['name', 'domain', 'title', 'apps', 'dimensions', 'auth', 'password', 'tags', 'background', 'thumb'])
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
              self.db.ActionLog.new(request.requester, "new_expression_save", data={'expr_id': res.id})
              request.requester.flag('expr_new')
              if request.requester.get('flags').get('add_invites_on_save'):
                  request.requester.unflag('add_invites_on_save')
                  request.requester.give_invites(5)
            except DuplicateKeyError:
                if exp.get('overwrite'):
                    self.db.Expr.named(upd['domain'], upd['name']).delete()
                    res = request.requester.expr_create(upd)
                    self.db.ActionLog.new(request.requester, "new_expression_save", data={'expr_id': res.id, 'overwrite': True})
                else:
                    return { 'error' : 'overwrite' } #'An expression already exists with the URL: ' + upd['name']
                    self.db.ActionLog.new(request.requester, "new_expression_save_fail", data={'expr_id': res.id, 'error': 'overwrite'})
        else:
            if not res['owner'] == request.requester.id:
                raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
            res.update(**upd)
            new_expression = False
            self.db.ActionLog.new(request.requester, "update_expression", data={'expr_id': res.id})
        return dict( new=new_expression, error=False, id=res.id, location=abs_url(domain = upd['domain']) + upd['name'] )


    def delete(self, request, response):
        e = self.db.Expr.fetch(request.form.get('id'))
        if not e: return self.serve_404(request, response)
        if e['owner'] != request.requester.id: raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
        e.delete()
        if e['name'] == '': request.requester.expr_create({ 'title' : 'Homepage', 'home' : True })
        # TODO: garbage collect media files that are no longer referenced by expression
        return self.redirect(response, request.requester.url)


    def add_comment(self, request, response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'x-requested-with')
        commenter = request.requester
        expression = self.db.Expr.fetch(request.form.get('expression'))
        comment_text = request.form.get('comment')
        comment = self.db.Comment.new(commenter, expression, {'text': comment_text})
        if comment.initiator.id != expression.owner.id:
            newhive.mail.mail_feed(self.jinja_env, comment, expression.owner)
        return self.serve_html(response, self.jinja_env.get_template("partials/comment.html").render({'comment': comment}))

    def tag_update(self, request, response):
        tag = lget(normalize(request.form.get('value', '')), 0)
        id = request.form.get('expr_id')
        expr = self.db.Expr.fetch(id)
        if request.requester.id != expr.owner.id and not tag == "starred": return False
        action = request.form.get('action')
        if action == 'tag_add':
            if tag == "starred":
                s = Star.new(request.requester, expr)
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

    def _expr_list(self, spec, **args):
        return map(self._format_card, self.db.Expr.list(spec, **args))

    def _format_card(self, e):
        dict.update(e
            ,updated = friendly_date(time_u(e['updated']))
            ,url = abs_url(domain=e['domain']) + e['name']
            ,tags = e.get('tags_index', [])
            )
        return e

    def _expr_home_list(self, p2, request, response, limit=90, cname='expr'):
        root = self.db.User.get_root()
        tag = p2 if p2 else lget(root.get('tags'), 0) # make first tag/category default community page
        tag = {'name': tag, 'url': '/home/' + tag}
        page = int(request.args.get('page', 0))
        ids = root.get('tagged', {}).get(tag['name'], []) if cname == 'expr' else []
        cols = { 'expr' : self.db.Expr, 'user' : self.db.User }
        if ids:
            by_id = {}
            for e in cols[cname].list({'_id' : {'$in':ids}}, requester=request.requester.id): by_id[e['_id']] = e
            entities = [by_id[i] for i in ids if by_id.has_key(i)]
            response.context['pages'] = 0;
        else:
            entities = cols[cname].list({}, sort='updated', limit=limit, page=page)
            response.context['pages'] = cols[cname].count({});
        if cname=='expr':
            response.context['exprs'] = map(self._format_card, entities)
            response.context['tag'] = tag
            response.context['show_name'] = True
        elif cname=='user': response.context['users'] = entities
        response.context['page'] = page

    # www_expression -> String, this maybe should go in state.Expr
    def _expr_to_html(self, exp):
        """Converts JSON object representing an expression to HTML"""

        apps = exp.get('apps')
        if not apps: return ''

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
            else: html = content
            data = " data-angle='" + str(app.get('angle')) + "'" if app.get('angle') else ''
            data += " data-scale='" + str(app.get('scale')) + "'" if app.get('scale') else ''
            return "<div class='happ' style='%s'%s>%s</div>" % (css_for_app(app) + more_css, data, html)

        return ''.join(map(html_for_app, apps))

    def _pagethrough(self, request, response, resource):
        pagethrough = {'next': None, 'prev': None}
        shared_spec = {}
        url_args = {}
        root = self.db.User.get_root()
        loop = False
        if request.args.has_key('user'):
            loop = True
            user = re.sub('[^A-Za-z]', '', request.args.get('user')) #prevent injection hacks
            shared_spec.update({'owner_name': user})
            url_args.update({'user': user})
        if request.args.has_key('tag'):
            tag = re.sub('[^A-Za-z]', '', request.args.get('tag')) #prevent injection hacks
            root_tags = [key for key in root.get('tagged', {})]
            if tag in root_tags:
                ids = root.get('tagged', {}).get(tag, [])
                shared_spec = ids
            else:
                tag = tag.lower()
                if tag in ['recent']: shared_spec = {}
                else:  shared_spec.update({'tags_index': tag})
            url_args.update({'tag': tag})
        pagethrough['next'] = resource.related_next(shared_spec, loop=loop)
        pagethrough['prev'] = resource.related_prev(shared_spec, loop=loop)

        if pagethrough['next']: pagethrough['next'] = pagethrough['next'].url + querystring(url_args)
        if pagethrough['prev']: pagethrough['prev'] = pagethrough['prev'].url + querystring(url_args)

        return pagethrough
