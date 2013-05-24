from newhive.utils import dfilter
from newhive.controllers.base import Controller

class Community(Controller):
    def search(self, tdata, request, **paging_args):
        return self.db.query(request.args.get('q'), **paging_args)

    def trending(self, tdata, request, username=None, **paging_args):
        print "username = %s" % username
        user = self.db.User.named(username)
        return {
            'page_data': {
                "cards": user.feed_page_esdb(feed='trending', **paging_args),
                'header': ("The Hive", "Trending"),
                'card_type': 'expr',
            },
            'title': "Network - Trending",
        }

    def network(self, tdata, request, username=None, **paging_args):
        user = self.db.User.named(username)
        return {
            'page_data': {
                "cards": user.feed_page_esdb(feed='network', **paging_args),
                "header": ("Network", "Recent"),
                'card_type': 'expr',
            },
            "title": 'Network - Recent',
        }

    # TODO: fix/test these functions for looking at other (nonowner) pages
    def expressions_public(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        spec = {'owner_name': owner_name, 'auth': 'public'}
        cards = self.db.Expr.page(spec, tdata.user, **args)
        profile = owner.client_view(activity=True)
        profile['profile_bg'] = owner.get('profile_bg')
        return {
            'page_data': { 'cards': cards, 'profile': profile, 'card_type':'expr' },
            'title': 'Expressions by ' + owner['name'],
        }
    def expressions_private(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        spec = {'owner_name': owner_name, 'auth': 'private'}
        cards = self.db.Expr.page(spec, tdata.user, **args)
        return {
            'page_data': { 'cards': cards, 'profile': owner.client_view(activity=True), 'card_type':'expr' },
            'title': 'Your Private Expressions',
        }

    def loves(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the feeds starred by owner_name...
        spec = {'initiator_name': owner_name, 'entity_class':'Expr' }
        # ...and grab its expressions.
        cards = self.db.Expr.fetch(map(lambda en:en['entity'], 
            self.db.Star.page(spec, tdata.user, **args)))
        profile = owner.client_view(activity=True)
        profile['profile_bg'] = owner.get('profile_bg')
        return {
            'page_data': { 'cards': cards, 'profile': profile, 'card_type':'expr',
                'feed_layout':'mini' },
            'title': 'Loves by ' + owner['name'],
            'about_text': 'Loves',
        }

    def expressions_comments(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the feeds starred by owner_name...
        spec = { '$or': [{'initiator_name': owner_name}, {'entity_owner': owner.id}],
                'entity_class':'Expr' }
        # ...and grab its expressions.
        cards = self.db.Expr.fetch(map(lambda en:en['entity'], 
            self.db.Comment.page(spec, tdata.user, **args)))
        profile = owner.client_view()
        profile['profile_bg'] = owner.get('profile_bg')
        return {
            'page_data': { 'cards': cards, 'profile': profile, 'card_type':'expr',
                'feed_layout':'mini' },
            'title': 'Comments by ' + owner['name'],
            'about_text': 'Comments',
        }

    # WIP: waiting on Abram's network: recent commit
    def activity(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the feeds starred by owner_name...
        spec = {'initiator_name': owner_name }
        # ...and grab its expressions.
        activity = self.db.Feed.search(spec, **args)
        print "hi! {}".format(len(activity))
        profile = owner.client_view(activity=True)
        profile['profile_bg'] = owner.get('profile_bg')
        return {
            'page_data': { 'cards': activity, 'profile': profile, 'card_type':'expr', },
            'title': 'Loves by ' + owner['name'],
            'about_text': 'Loves',
        }

    def following(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the users starred by owner_name...
        spec = {'initiator_name': owner_name, 'entity_class':'User' }
        # ...and grab its users.
        users = self.db.User.fetch(map(lambda en:en['entity'], 
            self.db.Star.page(spec, tdata.user, **args)))
        profile = owner.client_view(activity=True)
        profile['profile_bg'] = owner.get('profile_bg')
        # TODO: allow tag following, ?concat to personal tags
        tags = owner['tags'] if owner.has_key('tags') else []
        return {
            'page_data': { 'tags': tags, 'cards': users, 'profile': profile, 'card_type':'user',
                'feed_layout':'mini' },
            'title': owner['name'] + ' Following',
            'about_text': 'Following',
        }

    # TODO: extract commonality from these methods.
    def followers(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        users = owner.starrer_page(**args)
        profile = owner.client_view(activity=True)
        profile['profile_bg'] = owner.get('profile_bg')
        return {
            'page_data': { 'cards': users, 'profile': profile, 'card_type':'user' },
            'title': owner['name'] + ': Followers',
            'about_text': 'Followers',
        }

    def user_home(self, tdata, request, owner_name=None, **args):
        # show home expression or redirect to home 
        return {}

    def expr(self, tdata, request, id=None, owner_name=None, expr_name=None):
        print "EXPR", id, owner_name, expr_name
        expr = ( self.db.Expr.fetch(id) if id else
            self.db.Expr.named(owner_name, expr_name) )
        if not expr: return None
        # owner = self.db.User.named(owner_name)
        expr_owner = expr.get_owner()
        profile = expr_owner.client_view()
        profile['profile_bg'] = expr_owner.get('profile_bg')
        return {
            'page_data': {
                'profile': profile,
                'expr': expr.client_view(),
                'expr_id': expr.id,
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
        pagination_args = dfilter(request.args, ['at', 'by', 'limit', 'sort', 'order'])
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
