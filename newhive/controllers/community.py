from newhive.utils import dfilter
from newhive.controllers.base import Controller

class Community(Controller):
    def network_trending(self, tdata, request, username=None, **paging_args):
        return {
            'page_data': {
                'cards': tdata.user.feed_network(**paging_args),
                'header': ("The Hive", "Trending"),
            },
            'title': "Network - Trending",
        }

    def network_recent(self, tdata, request, username=None, **paging_args):
        return {
            'page_data': {
                "cards": tdata.user.feed_network(**paging_args),
                "header": ("Network", "Recent")
            },
            "title": 'Network - Recent',
        }

    def expressions_public(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        spec = {'owner_name': owner_name, 'auth': 'public'}
        cards = self.db.Expr.page(spec, tdata.user, **args)
        return {
            'page_data': { 'cards': cards, 'profile': owner.client_view() },
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

    def user_home(self, tdata, request, owner_name=None, **args):
        # show home expression or redirect to home 
        return {}

    def expr(self, tdata, request, owner_name=None, expr_name=None, **args):
        expr = self.db.Expr.named(owner_name, expr_name)
        return {
            'page_data': {
                'expr_id': expr.id
            },
            'title': expr['title'],
        }

    def dispatch(self, handler, request, json=False, **kwargs):
        (tdata, response) = self.pre_process(request)
        query = getattr(self, handler, None)
        if query is None:
            return self.serve_404(tdata, request, response, json=json)
        # Handle keyword args to be passed to the controller function
        passable_keyword_args = dfilter(kwargs, ['owner_name', 'expr_name'])
        # Handle pagination
        pagination_args = dfilter(request.args, ['at', 'limit', 'sort', 'order'])
        for k in ['limit', 'order']:
            if k in pagination_args: pagination_args[k] = int(pagination_args[k])
        # Call controller function with query and pagination args
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
