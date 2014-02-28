import json
from collections import Counter
from werkzeug import Response

from newhive import mail
from newhive.ui_strings import en as ui_str
from newhive.utils import dfilter, now, abs_url, AbsUrl
from newhive.controllers.controller import Controller

class Community(Controller):
    def featured(self, tdata, request, db_args={}, **args):
        return {
            "cards": self.db.query('#Featured', viewer=tdata.user, **db_args),
            'header': ("The Hive",), 'card_type': 'expr',
            'title': "The Hive",
        }

    def empty(self, tdata, request, **args):
        return False

    def recent(self, tdata, request, db_args={}, **args):
        return {
            "cards": self.db.query('#Recent', viewer=tdata.user, **db_args),
            'header': ("ALL Expressions",), 'card_type': 'expr',
            'title': "NewHive - ALL",
        }

    def trending(self, tdata, request, username=None, db_args={}, **args):
        user = self.db.User.named(username)
        if not user:
            user = tdata.user
        # Logged out users see featured.
        if not user or not user.id:
            return self.featured(tdata, request, db_args=db_args, **args)
        return {
            "network_help": (len(user.starred_user_ids) <= 1),
            "cards": user.feed_trending(**db_args),
            'header': ("Network",), 'card_type': 'expr',
            'title': "Network",
        }

    def network(self, tdata, request, username=None, db_args={}, **args):
        user = self.db.User.named(username)
        if not user:
            user = tdata.user
        return {
            "cards": user.feed_recent(**db_args),
            "header": ("Recent",), 'card_type': 'expr',
            "title": 'Recent',
        }

    def forms_signup(self, tdata, request, username=None, **args):
        referral = self.db.Referral.find({'key': request.args.get('key')})
        resp = {'form': 'create_account', 'title': "NewHive - Sign Up", }
        if not self.flags.get('open_signup'):
            if not referral:
                resp['error'] = 'referral'
            else:
                resp['fullname'] = referral.get('name')
        return resp

    def expressions_for(self, tdata, cards, owner, **args):
        if 0 == len(cards) and tdata.user == owner:
            # New user has no cards; give him the "edit" card
            # TODO: replace thenewhive with a config string
            cards = []
            instructional = self.db.Expr.named("newhive","default-instructional")
            if instructional:
                cards.append(instructional);
        profile = owner.client_view(viewer=tdata.user)
        return {
            'cards': cards, 'owner': profile, 'card_type':'expr',
            'title': 'Expressions by ' + owner['name'],
        }

    def expressions_public_tags(self, tdata, request, owner_name=None, db_args={}, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        if args.get('tag_name'): return self.expressions_tag(
            tdata, request, owner_name=owner_name, **args)
        spec = {'owner_name': owner_name}
        cards = self.db.Expr.page(spec, viewer=tdata.user, auth='public', **db_args)
        return self.expressions_for(tdata, cards, owner)

    def expressions_public(self, tdata, request, owner_name=None, db_args={}, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        cards = owner.profile(at=db_args.get('at', 0))
        return self.expressions_for(tdata, cards, owner)

    def expressions_tag(self, tdata, request, owner_name=None, 
            entropy=None, tag_name=None, db_args={}, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        if entropy and entropy != owner.get('tag_entropy', {}).get(tag_name, ''):
            return None
        if entropy or owner.id == tdata.user.id:
            db_args['override_unlisted'] = True
        profile = owner.client_view(viewer=tdata.user)

        result, search = self.db.query_echo("@" + owner_name + " #" + tag_name,
            viewer=tdata.user, **db_args)

        data = {
            "cards": result,
            "card_type": "expr",
            "tag_selected": tag_name,
            'owner': profile,
            'title': 'Expressions by ' + owner['name'],
        }
        if owner.id == tdata.user.id:
            data.update({"tag_entropy": owner.get('tag_entropy', {}).get(tag_name)})
        return data

    def expressions_private(self, tdata, request, owner_name=None, db_args={}, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        spec = {'owner_name': owner_name}
        cards = self.db.Expr.page(spec, viewer=tdata.user, auth='password', **db_args)
        return {
            'cards': cards, 'owner': owner.client_view(), 'card_type':'expr',
            'title': 'Your Private Expressions',
        }

    def settings_update(self, tdata, request, owner_name=None, **args):
        """ Doubles as post handler and settings page api route
            for settings """
        owner = tdata.user

        subscribed = owner.get('email_subscriptions', [])
        email_lists = map(lambda email_list: {
            'id': 'email_' + email_list.name,
            'subscribed': email_list.name in subscribed,
            'description': ui_str.email_subscription_ui[email_list.name],
            'name': email_list.name
        }, mail.MetaMailer.unsubscribable('user'))

        # if user submitted form
        if len(request.form.keys()):
            # update user email and password.
            if request.form.get('email'):
                update = dict(
                    email=request.form.get('email'))

                if ( ( request.form.get('email') != owner['email'] ) or
                    request.form.get('new_password')
                ) and ( not owner.cmp_password(request.form.get('password')) ):
                    return { 'error': 'Password given does not match existing password' };
                if request.form.get('new_password'):
                    password = request.form.get('new_password', '')
                    if owner.check_password(password):
                        return { 'error': owner.check_password(password) }
                    update.update({'password': password})

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
            
            # update email subscriptions
            subscribed = []
            for email_list in email_lists:
                if request.form.get(email_list['id']):
                    subscribed.append(email_list['name'])
                    email_list['subscribed'] = True
                else:
                    email_list['subscribed'] = False
            update['email_subscriptions'] = subscribed

            owner.update(**update)

            # TODO: implement account deletion


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

    def loves(self, tdata, request, owner_name=None, db_args={}, **args):
        # TODO: properly handle private expressions by passing viewer to cards

        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the feeds starred by owner_name...
        spec = {'initiator_name': owner_name, 'entity_class':'Expr' }
        # ...and grab its expressions.
        cards = self.db.Expr.fetch(map(lambda en:en['entity'], 
            self.db.Star.page(spec, viewer=tdata.user, **db_args)))
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

    def following(self, tdata, request, owner_name=None, db_args={}, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the users starred by owner_name...
        spec = {'initiator_name': owner_name, 'entity_class':'User' }
        # ...and grab its users.
        users = self.db.User.fetch(map(lambda en:en['entity'], 
            self.db.Star.page(spec, viewer=tdata.user, **db_args)))
        profile = owner.client_view(viewer=tdata.user)
        tags = owner.get('tags_following', [])
        return {
            'special': {'mini_expressions': 3},
            'tag_list': tags, 'cards': users, 'owner': profile, 'card_type':'user',
            'title': owner['name'] + ' Following', 'about_text': 'Following',
        }

    # TODO: extract commonality from these methods.
    def followers(self, tdata, request, owner_name=None, db_args={}, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        users = owner.starrer_page(**db_args)
        profile = owner.client_view(viewer=tdata.user)
        return {
            'special': {'mini_expressions': 3},
            'cards': users, 'owner': profile, 'card_type':'user',
            'title': owner['name'] + ': Followers', 'about_text': 'Followers',
        }

    def expr(self, tdata, request, id=None, owner_name=None, expr_name='', **args):
        expr = ( self.db.Expr.fetch(id) if id else
            self.db.Expr.named(owner_name, expr_name) )
        if not expr:
            if args.get('route_name') == 'user_home':
                return self.redirect(self.response,
                    abs_url('/' + owner_name + '/profile'))
            return None
        return self.serve_expr(tdata, request, expr)

    def expr_custom_domain(self, tdata, request, path='', **args):
        url = request.host + ('/' if path else '') + path
        expr = self.db.Expr.find({'url': url})
        tdata.context['domain'] = request.host
        return self.controllers['expr'].serve_naked(
            tdata, request, self.response, expr)
        # page_data = self.serve_expr(tdata, request, expr)
        # page_data['domain'] = request.host
        # return page_data

    def serve_expr(self, tdata, request, expr):
        meta = {}
        resp = {
            'expr_id': expr.id,
            'content_url': abs_url(domain=self.config.content_domain, 
                secure=request.is_secure) + expr.id,
            'expr': expr.client_view(viewer=tdata.user, activity=10)
        }

        if (not tdata.user.can_view(expr)
            and not expr.cmp_password(request.form.get('password'))
            and not expr.cmp_password(request.args.get('pw'))
        ):
            resp['expr'] = dfilter(resp['expr'], ['owner', 'auth', 'id', 'name'])
            resp['expr']['title'] = '[password required]'
            resp['error'] = 'password'
        else:
            meta['img_url'] = expr.snapshot_name('big')
            expr_owner = expr.get_owner()
            if expr_owner and expr_owner['analytics'].get('views_by'):
                expr_owner.increment({'analytics.views_by': 1})
            if not expr.get('views'): expr['views'] = 0
            if expr_owner.id != tdata.user.id: expr.increment({'views': 1})
        resp['meta'] = meta
        return resp

    def edit_expr(self, tdata, request, id=None, **args):
        expr = self.db.Expr.fetch(id)
        if not expr or (
            (not tdata.user.can_view(expr)) and expr.get('password')
        ): return None
        # For others' expressions, require the #remix tag
        if (tdata.user.id != expr['owner'] and
            "remix" not in expr.get('tags_index', [])):
            return None
        expr['id'] = expr.id
        return { 'expr': expr }

    def search(self, tdata, request, id=None, owner_name=None, expr_name=None,
        db_args={}, **args
    ):
        if not request.args.has_key('q'): return None
        id = request.args.get('id', None)
        result, search = self.db.query_echo(request.args['q'],
            viewer=tdata.user, id=id, **db_args)
        print('executed search', search)
        tags = search.get('tags', [])
        text = search.get('text', [])
        # Treat single-word text search as a tag search (show tag page)
        if len(search) == 1 and len(text) == 1:
            tags = text
        data = {
            "cards": result,
            "card_type": "expr",
            'title': 'Search',
            'header': ("Search", request.args['q']),
        }
        if len(search) == 1 and len(tags) == 1:
            profile = tdata.user
            profile = dfilter(profile, ['tags_following'])
            data.update({'tags_search': tags, 'page': 'tag_search', 'viewer': profile})
        return data

    def admin_query(self, tdata, request, db_args={}):
        if not self.flags.get('admin'):
            return {}

        q = json.loads(request.args.get('q', '{}'))
        res = self.db.Expr.search(q, limit=20, skip=args.get('at', 0),
            sort=[(args.get('sort', 'updated'), args.get('order', -1))])
        return {
            'cards': list(res),
            'card_type': 'expr'
        }

    # TODO-cleanup: currently used for redirects. Remove this, make propper
    # redirect controller
    #redirect-cleanup
    def empty(self, tdata, request, **args):
        return {}

    @classmethod
    def parse_query(klass, query_string):
        if query_string:
            return "?" + query_string
        return ""

    def pre_dispatch(self, query, tdata, request, response, json=False, **kwargs):
        # "Merged" users see trending
        self.response = response

        # TODO-cleanup: remove this, see #redirect-cleanup Handle redirects
        if kwargs.get('route_name') == 'my_profile':
            return self.redirect(response, abs_url(
                '/' + tdata.user['name'] + '/profile' +
                Community.parse_query(request.query_string)))
        # TODO-cleanup: remove once old create_account links aren't being used
        if kwargs.get('route_name') == 'old_signup':
            u = AbsUrl('home/signup')
            u.query.update({'key': kwargs.get('key')})
            return self.redirect(response, str(u))

        if query is None:
            return self.serve_404(tdata, request, response, json=json)
        # Handle pagination
        pagination_args = dfilter(request.args, ['at', 'by', 'limit', 'sort', 'order'])
        for k in ['at', 'order']:
            if k in pagination_args: pagination_args[k] = int(pagination_args[k])
        # Call controller with route and pagination args
        page_data = query(tdata, request, db_args=pagination_args, **kwargs)
        if not page_data:
            print request
            return self.serve_404(tdata, request, response, json=json)

        if(type(page_data) is Response):
            return page_data

        if type(page_data.get('cards')) is list:
            owner = self.db.User.named(kwargs.get('owner_name',''))
            page_data['cards_route'] = { 'route_args': kwargs,
                'query': request.args }
            special = page_data.get('special', {})
            if page_data.get('special'):
                del page_data['special']
            page_data['cards'] = [o.client_view(special=special) for o in page_data['cards']]

            if owner and kwargs.get('include_tags'):
                # TODO-perf: don't update list on query, update it when it changes!
                owner.calculate_tags()
                (ordered_count, all_tags) = owner.get_tags(
                    tdata.user.id == owner.id and kwargs.get('private'))
                tag_name = kwargs.get('tag_name')
                if tag_name and tag_name not in all_tags:
                    all_tags = all_tags[:ordered_count] + [tag_name] + all_tags[ordered_count:]
                page_data['tag_list'] = all_tags # [:num_tags]
                page_data['ordered_count'] = ordered_count
                if kwargs.get('private') and tdata.user.id == owner.id:
                    page_data['tag_entropy'] = owner.get('tag_entropy', {})
            else:
                # Collate tags into list by most commonly appearing.
                cnt = Counter()
                for card in page_data['cards']:
                    for tag in (card.get('tags', []) if card.get('tags') else []):
                        cnt[tag] += 1
                # TODO: we'll have to have another solution with pagination.
                if type(page_data.get('tag_list')) != list:
                    page_data['tag_list'] = map(lambda x: x[0], cnt.most_common(16))
                if owner and kwargs['route_name'] == 'expressions_public_tags':
                    tagged = owner.get('tagged', {}).keys()
                    num_tags = max(len(tagged), 16)
                    tagged.extend(page_data['tag_list'])
                    page_data['tag_list'] = tagged[:num_tags]
            # Fetch feed data
            for card in page_data['cards']:
                feed = card.get('feed', [])
                card['feed'] = map(lambda x: x.client_view(), feed)

        if json:
            return self.serve_json(response, page_data)
        else:
            tdata.context.update(page_data=page_data, route_args=kwargs)
            if page_data.get('meta'):
                tdata.context.update(page_data['meta'])
                del page_data['meta']
            if page_data.get('expr'):
                tdata.context.update(meta_title=page_data.get('expr').get('title'))
            tdata.context.update(meta_url=request.url)

            return self.serve_loader_page('pages/main.html', tdata, request, response)
