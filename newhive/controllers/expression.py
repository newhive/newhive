from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController

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

        if not exp: return serve_404(request, response)

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
        resource = self.db.Expr.find(owner=owner.id, name=request.path.lower())
        if not resource: resource = Expr.named(request.domain, '')

        is_owner = request.requester.logged_in and owner.id == request.requester.id
        if resource.get('auth') == 'private' and not is_owner: return serve_404(request, response)

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

    def index(self, request, response):
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

    def _expr_list(self, spec, **args):
        return map(self._format_card, self.db.Expr.list(spec, **args))

    def _format_card(self, e):
        dict.update(e
            ,updated = friendly_date(time_u(e['updated']))
            ,url = abs_url(domain=e['domain']) + e['name']
            ,tags = e.get('tags_index', [])
            )
        return e

    def _expr_home_list(self, p2, request, response, limit=90, klass='expr'):
        if klass == 'expr': klass = self.db.Expr
        root = self.db.User.get_root()
        tag = p2 if p2 else lget(root.get('tags'), 0) # make first tag/category default community page
        tag = {'name': tag, 'url': '/home/' + tag}
        page = int(request.args.get('page', 0))
        ids = root.get('tagged', {}).get(tag['name'], []) if klass == self.db.Expr else []
        if ids:
            by_id = {}
            for e in klass.list({'_id' : {'$in':ids}}, requester=request.requester.id): by_id[e['_id']] = e
            entities = [by_id[i] for i in ids if by_id.has_key(i)]
            response.context['pages'] = 0;
        else:
            entities = klass.list({}, sort='updated', limit=limit, page=page)
            response.context['pages'] = klass.list_count({});
        if klass==self.db.Expr:
            response.context['exprs'] = map(self._format_card, entities)
            response.context['tag'] = tag
            response.context['show_name'] = True
        elif klass==self.db.User: response.context['users'] = entities
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
        pagethrough['next'] = resource.next(shared_spec, loop=loop)
        pagethrough['prev'] = resource.prev(shared_spec, loop=loop)

        if pagethrough['next']: pagethrough['next'] = pagethrough['next'].url + querystring(url_args)
        if pagethrough['prev']: pagethrough['prev'] = pagethrough['prev'].url + querystring(url_args)

        return pagethrough



