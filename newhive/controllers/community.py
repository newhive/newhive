from newhive import mail
from newhive.ui_strings import en as ui_str
from newhive.utils import dfilter, now, abs_url
from newhive.controllers.controller import Controller
from collections import Counter

class Community(Controller):
    def search(self, tdata, request, **paging_args):
        return self.db.query(request.args.get('q'), **paging_args)

    # def home(self, tdata, request, **paging_args):
        # return self.featured(self, tdata, request, **paging_args)

    def featured(self, tdata, request, **paging_args):
        return {
            "cards": self.db.query('#Featured', viewer=tdata.user),
            'header': ("The Hive",), 'card_type': 'expr',
            'title': "The Hive",
        }

    def recent(self, tdata, request, **paging_args):
        return {
            "cards": self.db.query('#Recent', viewer=tdata.user),
            'header': ("ALL Expressions",), 'card_type': 'expr',
            'title': "NewHive - ALL",
        }

    def trending(self, tdata, request, username=None, **paging_args):
        user = self.db.User.named(username)
        if not user:
            user = tdata.user
        # Logged out users see featured.
        if not user or not user.id:
            return self.featured(tdata, request, **paging_args)
        return {
            "cards": user.feed_page_esdb(feed='trending', **paging_args),
            'header': ("Network",), 'card_type': 'expr',
            'title': "Network",
        }

    def network(self, tdata, request, username=None, **paging_args):
        user = self.db.User.named(username)
        if not user:
            user = tdata.user
        return {
            "cards": user.feed_page_esdb(feed='network', **paging_args),
            "header": ("Recent",), 'card_type': 'expr',
            "title": 'Recent',
        }

    def forms_signup(self, tdata, request, username=None, **paging_args):
        return {
            'form': 'create_account', 'title': "NewHive - Sign Up",
        }

    # TODO: fix/test these functions for looking at other (nonowner) pages
    def expressions_public(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        spec = {'owner_name': owner_name, 'auth': 'public'}
        cards = self.db.Expr.page(spec, tdata.user, **args)
        profile = owner.client_view(viewer=tdata.user)
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
            'cards': cards, 'owner': owner.client_view(), 'card_type':'expr',
            'title': 'Your Private Expressions',
        }
    def settings_update(self, tdata, request, owner_name=None, **args):
        """ Doubles as post handler and settings page api route
            for settings """
        owner = tdata.user

        print request.form
        if (len(request.form.keys())):
            if request.form.get('email'):
                update = dict(
                    email=request.form.get('email'))
                if ( ( request.form.get('email') != owner['email'] ) or
                    request.form.get('new_password')
                ) and ( not owner.cmp_password(request.form.get('password')) ):
                    return { 'error': 'Password given does not match existing password' };
                if request.form.get('new_password'):
                    update.update({'password': request.form.get('new_password')})


                if update['email'] and update['email'] != owner.get('email'):
                    request_date = now()
                    # owner.update(email_confirmation_request_date=request_date)
                    try:
                        mail.EmailConfirmation(db=self.db, jinja_env=self.jinja_env).send(
                            owner, update['email'], request_date)
                    except Exception, e:
                        pass
                        # return { 'error': 'Email not sent' };
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
            'title': 'Edit your settings',
            'email_lists': email_lists,
        }

    def user_update(self, tdata, request, owner_name=None, **args):
        """ Doubles as post handler and settings page api route
            for profile edit """
        owner = tdata.user

        # If user update form submitted, update user
        if request.form.get('user_update'):
            update = dict(
                fullname=request.form.get('fullname'),
                profile_about=request.form.get('profile_about'))

            file_r = self.db.File.fetch(request.form.get('profile_bg'))
            if file_r:
                update['profile_bg_id'] = file_r.id
                update['profile_bg'] = file_r['url']
            file_r = self.db.File.fetch(request.form.get('profile_thumb'))
            if file_r:
                update['thumb_file_id'] = file_r.id

            owner.update(**update)

        return {
            'owner': tdata.user.client_view(),
            'title': 'Edit your profile',
        }

    def loves(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the feeds starred by owner_name...
        spec = {'initiator_name': owner_name, 'entity_class':'Expr' }
        # ...and grab its expressions.
        cards = self.db.Expr.fetch(map(lambda en:en['entity'], 
            self.db.Star.page(spec, tdata.user, **args)))
        profile = owner.client_view(viewer=tdata.user)
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
        profile = owner.client_view(viewer=tdata.user)
        tags = owner.get('tags_following', [])
        return {
            'special': {'mini_expressions': 3},
            'tag_list': tags, 'cards': users, 'owner': profile, 'card_type':'user',
            'title': owner['name'] + ' Following', 'about_text': 'Following',
        }

    # TODO: extract commonality from these methods.
    def followers(self, tdata, request, owner_name=None, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        users = owner.starrer_page(**args)
        profile = owner.client_view(viewer=tdata.user)
        return {
            'special': {'mini_expressions': 3},
            'cards': users, 'owner': profile, 'card_type':'user',
            'title': owner['name'] + ': Followers', 'about_text': 'Followers',
        }

    def expr(self, tdata, request, id=None, owner_name=None, expr_name=''):
        print "EXPR", id, owner_name, expr_name
        expr = ( self.db.Expr.fetch(id) if id else
            self.db.Expr.named(owner_name, expr_name) )
        if not expr: return None
        # owner = self.db.User.named(owner_name)
        expr_owner = expr.get_owner()
        if expr_owner and expr_owner['analytics'].get('views_by'):
            expr_owner.increment({'analytics.views_by': 1})
        if not expr.get('views'):
            expr['views'] = 0
        expr['views'] += 1
        expr.save(updated = False)
        profile = expr_owner.client_view(viewer=tdata.user)
        print expr_owner['analytics']
        # TODO(speed): expr client_view CONTAINS owner profile. Duplication of effort.
        return {
            'owner': profile, 'expr': expr.client_view(viewer=tdata.user, activity=10),
            'expr_id': expr.id, 'title': expr['title'],
        }

    def edit_expr(self, tdata, request, id=None, owner_name=None, expr_name=None):
        expr = ( self.db.Expr.fetch(id) if id else
            self.db.Expr.named(owner_name, expr_name) )
        if not expr: return None
        expr['id'] = expr.id
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
        search = query['search']
        tags = search.get('tags', [])
        print search
        data = {
            "cards": query['result'],
            "card_type": "expr",
            'title': 'Search',
            'header': ("Search", request.args['q']),  
        }
        if (len(search) == 1 and len(tags) == 1):
            profile = tdata.user
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
            # TODO-cleanup: make this less hacky
            if kwargs.get('route_name') == 'user_home':
                return self.redirect(response, abs_url(
                    '/' + kwargs.get('owner_name') + '/profile'))
            return self.serve_404(tdata, request, response, json=json)
        if page_data.get('cards'):
            special = page_data.get('special', {})
            if page_data.get('special'):
                del page_data['special']
            page_data['cards'] = [o.client_view(special=special) for o in page_data['cards']]
            # Collate tags into list by most commonly appearing.
            cnt = Counter()
            for card in page_data['cards']:
                for tag in (card.get('tags', []) if card.get('tags') else []):
                    cnt[tag] += 1
            # TODO: we'll have to have another solution with pagination.
            if type(page_data.get('tag_list')) != list:
                page_data['tag_list'] = map(lambda x: x[0], cnt.most_common(16))
            # Fetch feed data
            for card in page_data['cards']:
                feed = card.get('feed', [])
                card['feed'] = map(lambda x: x.client_view(), self.db.Feed.fetch(feed)[:3])
        if json:
            return self.serve_json(response, page_data)
        else:
            tdata.context.update(page_data=page_data, route_args=kwargs)
            return self.serve_loader_page('pages/main.html', tdata, request, response)
