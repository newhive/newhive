from newhive import mail
from newhive.ui_strings import en as ui_str
from newhive.utils import dfilter, now
from newhive.controllers.controller import Controller

class Community(Controller):
    def search(self, tdata, request, **paging_args):
        return self.db.query(request.args.get('q'), **paging_args)

    def home(self, tdata, request, **paging_args):
        return {
            "cards": self.db.query('#Featured', viewer=tdata.user),
            'header': ("Featured Expressions",), 'card_type': 'expr',
            'title': "NewHive - Featured",
        }

    def recent(self, tdata, request, **paging_args):
        return {
            "cards": self.db.query('#Recent', viewer=tdata.user),
            'header': ("Recent Expressions",), 'card_type': 'expr',
            'title': "NewHive - Featured",
        }

    def forms_signup(self, tdata, request, username=None, **paging_args):
        return {
            'form': 'create_account', 'title': "NewHive - Sign Up",
        }

    def trending(self, tdata, request, username=None, **paging_args):
        user = self.db.User.named(username)
        return {
            "cards": user.feed_page_esdb(feed='trending', **paging_args),
            'header': ("The Hive", "Trending"), 'card_type': 'expr',
            'title': "Network - Trending",
        }

    def network(self, tdata, request, username=None, **paging_args):
        user = self.db.User.named(username)
        return {
            "cards": user.feed_page_esdb(feed='network', **paging_args),
            "header": ("Network", "Recent"), 'card_type': 'expr',
            "title": 'Network - Recent',
        }

    # TODO: fix/test these functions for looking at other (nonowner) pages
    def expressions_public(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        spec = {'owner_name': owner_name, 'auth': 'public'}
        cards = self.db.Expr.page(spec, tdata.user, **args)
        profile = owner.client_view(activity=True)
        return {
            'cards': cards, 'owner': profile, 'card_type':'expr',
            'title': 'Expressions by ' + owner['name'],
        }
    def expressions_private(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        spec = {'owner_name': owner_name}
        cards = self.db.Expr.page(spec, tdata.user, auth='password', **args)
        return {
            'cards': cards, 'owner': owner.client_view(activity=True), 'card_type':'expr',
            'title': 'Your Private Expressions',
        }
    def user_update(self, tdata, request, owner_name=None, **args):
        """ Doubles as post handler and settings page api route
            for profile edit """
        owner = tdata.user

        # If user update form submitted, update user
        if request.form.get('user_update'):
            if ( ( request.form.get('email') != owner['email'] ) or
                request.form.get('new_password')
            ) and ( not owner.cmp_password(request.form.get('password')) ):
                return { 'error': 'Password given does not match existing password' };

            update = dict(
                fullname=request.form.get('fullname'),
                profile_about=request.form.get('profile_about'),
                email=request.form.get('email'))

            if request.form.get('new_password'):
                update.update({'password': request.form.get('new_password')})

            file_r = self.db.File.fetch(request.form.get('profile_bg'))
            if file_r:
                update['profile_bg_id'] = file_r.id
                update['profile_bg'] = file_r['url']
            file_r = self.db.File.fetch(request.form.get('profile_thumb'))
            if file_r:
                update['thumb_id'] = file_r.id

            if update['email'] and update['email'] != owner.get('email'):
                request_date = now()
                # owner.update(email_confirmation_request_date=request_date)
                mail.EmailConfirmation(db=self.db, jinja_env=self.jinja_env).send(
                    owner, update['email'], request_date)
                # message = message + ui.email_change_success_message + " "

            owner.update(**update)

        # TODO: implement account deletion

        subscribed = tdata.user.get('email_subscriptions', [])
        email_lists = map(lambda email_list: {
            'id': 'email_' + email_list.name,
            'subscribed': email_list.name in subscribed,
            'description': ui_str.email_subscription_ui[email_list.name],
            'name': email_list.name
        }, mail.MetaMailer.unsubscribable('user'))

        return {
            'owner': tdata.user.client_view(),
            'title': 'Edit your profile',
            'email_lists': email_lists,
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
        return {
            'cards': cards, 'owner': profile, 'card_type':'expr',
            'title': 'Loves by ' + owner['name'],
            'about_text': 'Loves',
        }

    # def expressions_comments(self, tdata, request, owner_name=None, **args):
    #     owner = self.db.User.named(owner_name)
    #     if not owner: return None
    #     # Get the feeds starred by owner_name...
    #     spec = { '$or': [{'initiator_name': owner_name}, {'entity_owner': owner.id}],
    #             'entity_class':'Expr' }
    #     # ...and grab its expressions.
    #     cards = self.db.Expr.fetch(map(lambda en:en['entity'], 
    #         self.db.Comment.page(spec, tdata.user, **args)))
    #     profile = owner.client_view()
    #     return {
    #         'page_data': { 'cards': cards, 'profile': profile, 'card_type':'expr',
    #             'feed_layout':'mini' },
    #         'title': 'Comments by ' + owner['name'],
    #         'about_text': 'Comments',
    #     }

    def following(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the users starred by owner_name...
        spec = {'initiator_name': owner_name, 'entity_class':'User' }
        # ...and grab its users.
        users = self.db.User.fetch(map(lambda en:en['entity'], 
            self.db.Star.page(spec, tdata.user, **args)))
        profile = owner.client_view(activity=True)
        tags = owner.get('tags_following', [])
        return {
            'special': {'mini_expressions': 3},
            'tags': tags, 'cards': users, 'owner': profile, 'card_type':'user',
            'title': owner['name'] + ' Following', 'about_text': 'Following',
        }

    # TODO: extract commonality from these methods.
    def followers(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        users = owner.starrer_page(**args)
        profile = owner.client_view(activity=True)
        return {
            'special': {'mini_expressions': 3},
            'cards': users, 'owner': profile, 'card_type':'user',
            'title': owner['name'] + ': Followers', 'about_text': 'Followers',
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
        return {
            'owner': profile, 'expr': expr.client_view(activity=10),
            'expr_id': expr.id, 'title': expr['title'],
        }

    def edit_expr(self, tdata, request, id=None, owner_name=None, expr_name=None):
        expr = ( self.db.Expr.fetch(id) if id else
            self.db.Expr.named(owner_name, expr_name) )
        if not expr: return None
        return { 'expr': expr }

    def search(self, tdata, request, id=None, owner_name=None, expr_name=None):
        if not request.args.has_key('q'): return None
        # terms = request.args['q'].split()
        # specs = []
        # tag_count = 0
        # owner_count = 0
        # text_count = 0
        # for term in terms:
        #     c = term[0]
        #     if c == '#':
        #         tag_count += 1
        #         spec = {'tags_index': term[1:]}
        #     elif c == '@':
        #         owner_count += 1
        #         spec = {'initiator_name': term[1:]}
        #     else:
        #         text_count += 1
        #         spec = {'text_index': term}
        #     specs.append(spec)

        # page_data = {}
        # # NOTE: owner_count > 1 should be impossible
        # if owner_count == 1
        #     profile = expr_owner.client_view()
        #     page_data.update('profile': profile)
        query = self.db._query(request.args['q'], viewer=tdata.user)
        data = {
            "cards": query['result'],
            "card_type": "expr",
            'title': 'Search',
        }
        search = query['search']
        tags = search.get('tags', [])
        if (len(search) == 1 and len(tags) == 1):
            profile = tdata.user #.client_view(activity=False)
            profile = dfilter(profile, ['tags_following'])
            data.update({'tags_search': tags, 'page': 'tag_search', 'viewer': profile})
        return data

    def empty(self, tdata, request, **args):
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

        page_data = query(tdata, request, **merged_args)
        if not page_data:
            return self.serve_404(tdata, request, response, json=json)
        if page_data.get('cards'):
            special = page_data.get('special', {})
            if page_data.get('special'):
                del page_data['special']
            page_data['cards'] = [o.client_view(special=special) for o in page_data['cards']]
        if json:
            return self.serve_json(response, page_data)
        else:
            tdata.context.update(page_data=page_data, route_args=kwargs)
            return self.serve_loader_page('pages/main.html', tdata, request, response)
