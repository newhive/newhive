from newhive.utils import dfilter
from newhive.controllers.base import Controller

class Community(Controller):
    def network_trending(self, tdata, request, username=None, **paging_args):
        print "username = %s" % username
        user = self.db.User.named(username)
        return {
            'page_data': {
                'cards': user.feed_network(**paging_args),
                'header': ("The Hive", "Trending"),
            },
            'title': "Network - Trending",
        }

    def network_recent(self, tdata, request, username=None, **paging_args):
        user = self.db.User.named(username)
        return {
            'page_data': {
                "cards": user.feed_network({}, **paging_args),
                "header": ("Network", "Recent")
            },
            "title": 'Network - Recent',
        }

    def expressions_public(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        spec = {'owner_name': owner_name, 'auth': 'public'}
        cards = self.db.Expr.page(spec, tdata.user, **args)
        profile = owner.client_view()
        profile['profile_bg'] = owner.get('profile_bg')
        return {
            'page_data': { 'cards': cards, 'profile': profile },
            'title': 'Expressions by ' + owner['name'],
        }
    def expressions_private(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        spec = {'owner_name': owner_name, 'auth': 'private'}
        cards = self.db.Expr.page(spec, tdata.user, **args)
        return {
            'page_data': { 'cards': cards, 'profile': owner.client_view() },
            'title': 'Your Private Expressions',
        }

    def expressions_loves(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the feeds starred by owner_name...
        spec = {'initiator_name': owner_name, 'entity_class':'Expr' }
        # ...and grab its expressions.
        cards = self.db.Expr.fetch(map(lambda en:en['entity'], 
            self.db.Star.page(spec, tdata.user, **args)))
        profile = owner.client_view()
        profile['profile_bg'] = owner.get('profile_bg')
        return {
            'page_data': { 'cards': cards, 'profile': profile },
            'title': 'Loves by ' + owner['name'],
        }

    def user_home(self, tdata, request, owner_name=None, **args):
        # show home expression or redirect to home 
        return {}

    def expr(self, tdata, request, id=None, owner_name=None, expr_name=None):
        print id, owner_name, expr_name
        expr = ( self.db.Expr.fetch(id) if id else
            self.db.Expr.named(owner_name, expr_name) )
        if not expr: return None
        return {
            'page_data': {
                'expr_id': expr.id
            },
            'title': expr['title'],
        }

    def empty(self, tdata, request):
        return { 'page_data': {} }

    def dispatch(self, handler, request, json=False, **kwargs):
        (tdata, response) = self.pre_process(request)
        query = getattr(self, handler, None)
        if query is None:
            return self.serve_404(tdata, request, response, json=json)
        # Handle pagination
        pagination_args = dfilter(request.args, ['at', 'limit', 'sort', 'order'])
        for k in ['limit', 'order']:
            if k in pagination_args: pagination_args[k] = int(pagination_args[k])
        # Call controller function with query and pagination args
        passable_keyword_args = dfilter(kwargs, ['username', 'owner_name', 'expr_name', 'id'])
        merged_args = dict(passable_keyword_args.items() + pagination_args.items())

        context = query(tdata, request, **merged_args)
        if not context:
            return self.serve_404(tdata, request, response, json=json)
        if context['page_data'].get('cards'):
            cards = context['page_data']['cards']
            context['page_data']['cards'] = [o.client_view() for o in cards]
        if json:
            return self.serve_json(response, context)
        else:
            tdata.context.update(context=context, route_args=kwargs)
            return self.serve_loader_page('pages/main.html', tdata, request, response)
