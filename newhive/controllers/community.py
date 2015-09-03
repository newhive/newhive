import json
from collections import Counter
from werkzeug import Response
import re

from newhive import mail
from newhive.ui_strings import en as ui_str
from newhive.utils import dfilter, now, abs_url, AbsUrl, validate_email
from newhive.controllers.controller import Controller
from newhive.state import Entity, collection_client_view, collection_of
from newhive.mongo_helpers import mq

class Community(Controller):
    def expr(self, tdata, id=None, owner_name=None, expr_name='', **args):
        expr = ( self.db.Expr.fetch(id) if id else
            self.db.Expr.named(owner_name, expr_name) )
        if not expr:
            if args.get('route_name') == 'user_home':
                return self.redirect(tdata.response,
                    abs_url('/' + owner_name + '/profile/feed'))
            return None
        return self.serve_expr(tdata, expr)

    def serve_expr(self, tdata, expr):
        meta = {}
        resp = {
            'expr_id': expr.id
            ,'content_url': abs_url(domain=self.config.content_domain, 
                secure=tdata.request.is_secure) + expr.id
            ,'expr': expr.client_view(viewer=tdata.user, activity=10)
            ,'title': expr.get('title', '[Untitled]')
        }

        if (not tdata.user.can_view(expr)
            and not expr.cmp_password(tdata.request.form.get('password'))
            and not expr.cmp_password(tdata.request.args.get('pw'))
        ):
            resp['expr'] = dfilter(resp['expr'], ['owner', 'auth', 'id', 'name'])
            resp['expr']['title'] = '[password required]'
            resp['error'] = 'password'
        else:
            snap_url = expr.snapshot_name('big')
            if snap_url and not snap_url.startswith("http"):
                meta['img_url'] = "http:" + snap_url  
            else: 
                meta['img_url'] = snap_url  
            expr_owner = expr.get_owner()
            if expr_owner and expr_owner['analytics'].get('views_by'):
                expr_owner.increment({'analytics.views_by': 1})
            if not expr.get('views'): expr['views'] = 0
            if expr_owner.id != tdata.user.id: expr.increment({'views': 1})
        resp['meta'] = meta
        return resp

    def expr_edit(self, tdata, id=None, **args):
        expr = self.db.Expr.fetch(id)
        if not expr or (
            (not tdata.user.can_view(expr)) and expr.get('password')
        ): return None
        # For others' expressions, require the #remix tag
        if (tdata.user.id != expr['owner'] and
            "remix" not in expr.get('tags_index', [])):
            return None
        expr['id'] = expr.id

        # editor currently depends on URL attribute
        apps = expr.get('apps', [])
        for a in apps:
            # print 'app ', a
            file_id = a.get('file_id') 
            # HACKHACK: Autopopulating url is a nonobvious side effect
            # and it breaks code modules
            if file_id and a.get('code_type') != 'js':
                # print (self.db.File.fetch(file_id) or {}).get('url')
                a['url'] = (self.db.File.fetch(file_id) or {}).get('url')

        return { 'expr': expr }

    def featured(self, tdata, db_args={}, **args):
        return {
            "cards": self.db.query('#Featured', **db_args),
            'header': ("The Hive",),
            'title': "The Hive",
        }

    def empty(self, tdata, **args):
        return False

    def recent(self, tdata, db_args={}, **args):
        return {
            "cards": self.db.query('#Recent', **db_args),
            'header': ("ALL Newhives",), 
            'title': "NewHive - ALL",
        }

    # TODO-cleanup: rename to home / the_hive
    def hive_featured(self, tdata, username=None, db_args={}, **args):
        user = self.db.User.named(username)
        if not user:
            user = tdata.user

        # New category view 
        return self.expressions_tag(tdata, _owner_name="root", 
            tag_name="featured", db_args=db_args, include_categories=True)

    def network_recent(self, tdata, username=None, db_args={}, **args):
        user = self.db.User.named(username)
        if not user:
            user = tdata.user
        return {
            "cards": user.feed_recent(**db_args),
            "header": ("Recent",),
            "title": 'Recent',
        }

    def forms_signup(self, tdata, username=None, **args):
        referral = self.db.Referral.find({'key': tdata.request.args.get('key')})
        resp = {'form': 'create_account', 'title': "NewHive - Sign Up", }
        if not self.flags.get('open_signup'):
            if not referral:
                resp['error'] = 'referral'
            else:
                resp['fullname'] = referral.get('name')
        return resp

    def expressions_for(self, tdata, cards, owner, no_empty=False, **db_args):
        if (not no_empty and 0 == len(cards) and tdata.user == owner
          and db_args.get('at', 0) == 0):
            # New user has no cards; give him the "edit" card
            # TODO: replace thenewhive with a config string
            cards = []
            instructional = self.db.Expr.named("newhive","default-instructional")
            if instructional:
                cards.append(instructional);
        profile = owner.client_view(viewer=tdata.user)
        return {
            'cards': cards, 'owner': profile, 
            'title': 'Newhives by ' + owner['name'],
        }

    def missing_expression(self):
        return {
            'title': 'Missing collection / ' + self.config.str_expression
            ,"missing": True
            ,"type": 'expr'
        }

    def expressions_tag(self, tdata, owner_name=None, db_args={}, **args):
        if not owner_name: 
            owner_name = args.get('_owner_name')
        owner = self.db.User.named(owner_name)
        if not owner: return None
        tag_name = args.get('tag_name')
        override_unlisted = (tdata.user.get('name') == owner_name)

        if tag_name:
            return include_collections( tdata, owner,
                self._expressions_tag(tdata, owner, tag_name,
                    args.get('entropy'), db_args=db_args),
                **args )
        
        spec = {'owner_name': owner_name}
        cards = self.db.Expr.page(spec, auth='public', **db_args)
        return include_collections( tdata, owner,
            self.expressions_for(tdata, cards, owner, **db_args), **args )

    # TODO: merge with above? helper to deal with entropy for private collections
    def _expressions_tag(self, tdata, owner=None, tag_name=None, entropy=None,
        db_args={}
    ):
        if entropy and entropy != owner.get('tag_entropy', {}).get(tag_name, ''):
            return None
        if entropy or owner.id == tdata.user.id:
            db_args['override_unlisted'] = True
        profile = owner.client_view(viewer=tdata.user)

        result, search = self.db.query_echo("@" + owner['name'] + " #"
            + tag_name, **db_args)

        data = {
            "cards": result,
            "tag_selected": tag_name,
            'owner': profile,
            'entropy': entropy,
            'title': 'Newhives by ' + owner['name'],
        }
        if owner.id == tdata.user.id:
            data.update({"tag_entropy": owner.get('tag_entropy', {}).get(tag_name)})
        return data

    def expressions_feed(self, tdata, owner_name=None,
        db_args={}, **args
    ):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        cards = owner.profile(at=db_args.get('at', 0))
        return include_collections( tdata, owner,
            self.expressions_for(tdata, cards, owner, **db_args), **args )

    def expressions_unlisted(self, tdata, owner_name=None, db_args={}, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        spec = {'owner_name': owner_name}
        cards = self.db.Expr.page(spec, auth='password', **db_args)
        return include_collections( tdata, owner, {
                'cards': cards, 'owner': owner.client_view(),
                'title': 'Your Private Newhives',
            }, **args )

    def expressions_random(self, tdata, **args):
        cards = self.db.Expr.page({}, auth='public', sort='random')
        return dict(cards=cards, title='Random newhives')


    def settings_update(self, tdata, owner_name=None, **args):
        """ Doubles as post handler and settings page api route
            for settings """
        owner = tdata.user
        request = tdata.request

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

    def user_update(self, tdata, owner_name=None, **args):
        """ Doubles as post handler and settings page api route
            for profile edit """
        owner = tdata.user
        request = tdata.request

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

    def loves(self, tdata, owner_name=None, db_args={}, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the feeds starred by owner_name...
        spec = {'initiator_name': owner_name, 'entity_class':'Expr' }
        # ...and grab its expressions.
        # TODO: deal with privacy by doing a mapreduce
        # _db_args = {} if owner_name != tdata.user.get('name') else db_args
        cards = self.db.Expr.fetch(map(lambda en:en['entity'], 
            self.db.Star.page(spec, **db_args)))
        # if owner_name != tdata.user.get('name'):
        #     spec['auth'] = 'public'

        profile = owner.client_view(viewer=tdata.user)
        return {
            'cards': cards, 'owner': profile,
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
    #         'page_data': { 'cards': cards, 'profile': profile, 
    #             'feed_layout':'mini' },
    #         'title': 'Comments by ' + owner['name'],
    #         'about_text': 'Comments',
    #     }

    def following(self, tdata, owner_name=None, db_args={}, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        # Get the users starred by owner_name...
        spec = {'initiator_name': owner_name, 'entity_class':'User' }
        # ...and grab its users.
        users = self.db.User.fetch(map(lambda en:en['entity'], 
            self.db.Star.page(spec, **db_args)))
        profile = owner.client_view(viewer=tdata.user)
        tags = owner.get('tags_following', [])
        return {
            'special': {'mini_expressions': 3},
            'tag_list': tags, 'cards': users, 'owner': profile, 
            'title': owner['name'] + ' Following', 'about_text': 'Following',
        }

    # TODO: extract commonality from these methods.
    def followers(self, tdata, owner_name=None, db_args={}, **args):
        owner = self.db.User.named(owner_name)
        if not owner: return None
        users = owner.starrer_page(**db_args)
        profile = owner.client_view(viewer=tdata.user)
        return {
            'special': {'mini_expressions': 3},
            'cards': users, 'owner': profile, 
            'title': owner['name'] + ': Followers', 'about_text': 'Followers',
        }

    def search(self, tdata, id=None, owner_name=None, expr_name=None,
        db_args={}, **args
    ):
        q = tdata.request.form.get('q') or tdata.request.args.get('q')
        if not q: return { 'cards': [], 'title':'Search' }
        id = tdata.request.args.get('id', None)
        entropy = tdata.request.args.get('e', None)
        owner = self.db.User.named(owner_name)
        search = self.db.parse_query(q)
        tags = search.get('tags', [])
        text = search.get('text', [])
        if entropy and search.get('user') and len(tags) == 1:
            user = self.db.User.named(search.get('user'))
            if user and user.get('tag_entropy',{}).get(tags[0], None) == entropy:
                db_args['override_unlisted'] = True

        result, search = self.db.query_echo(q, id=id, **db_args)
        # print('executed search', search)
        # Treat single-word text search as a tag search (show tag page)
        if len(search) == 1 and len(text) == 1:
            tags = text
            if len(text[0]) > 2 and self.flags.get('user_search'):
                # Also search for users matching the given text
                users = self.db.User.paginate({'name': {'$regex': text[0]}}, limit=20)
                result = users + result
        data = {
            "cards": result,
            'special': {'mini_expressions': 3},
            'title': 'Search',
            'header': ("Search", q),
        }
        if len(search) == 1 and len(tags) == 1:
            profile = tdata.user
            profile = dfilter(profile, ['tags_following'])
            data.update({'tags_search': tags, 'page': 'tag_search', 'viewer': profile})
        return data

    def admin_query(self, tdata, db_args={}, **kwargs):
        if not self.flags.get('admin'):
            return {}

        parse = json.loads
        args = tdata.request.args
        out = args.get('out', 'cards')
        collection = collection_of(self.db,
            args.get('collection', 'Expr').capitalize())
        q = mq(parse(args.get('q', '{}')))
        if args.get('day'):
            (time_prop, days_ago, day_span) = args['day'].split(',') 
            days_ago, day_span = float(days_ago), float(day_span)
            q.day(time_prop, days_ago, day_span)
        fields = None
        if args.get('fields'): fields = args['fields'].split(',')
        db_args.update(
            spec=q,
            sort=args.get('sort', 'created'),
            order=parse(args.get('order', '-1')),
            limit=parse(args.get('limit', '0' if fields else '20')),
            fields=fields
        )
        help = """
Query parameters:
    q: database query, e.g., {"owner_name": "zach"}
    day: time_property,days_ago,day_span
    sort: default updated
    order: default -1
    fields: prop1,prop2,prop3 (outputs fields in CSV format)
    collection: 'user' | 'feed' | 'trash' | 'expr' (default)
    special: 'top_tags' | 'top_lovers' |  None
    help: ...this...

Examples:
    Get list of emails from recent signups in the last 14 days
        /home/admin/query?day=created,14,14&collection=user&fields=email,name,fullname
    Show users with given email
        /home/admin/query?q={"email":"a@newhive.com"}&collection=user
"""

        # Special cases
        special = args.get('special')
        if special == 'top_tags':
            if tdata.request.args.get('help', False) != False:
                return { 'text_result': 'limit: default 1000' }
            db_args.update(limit=parse(args.get('limit', '1000')))
            common = self.db.tags_by_frequency(collection=collection, **db_args)
            return { 'data':
                "\n".join( [x[0] + ": " + str(x[1]) for x in common] ) }
        elif special == 'top_lovers':
            if tdata.request.args.get('help', False) != False:
                return { 'text_result': 'last_days: default 30' }
            last_days = parse(args.get('last_days', '30'))
            loves_by_users = Counter()
            for r in self.db.Feed.search( mq(class_name='Star',
                entity_class='Expr').gt('created', now()-86400*last_days)
            ): loves_by_users[r['initiator_name']] += 1
            resp = json.dumps(loves_by_users.most_common())
            return { 'text_result': re.sub(r'\],', '],\n', resp) }
        if tdata.request.args.get('help', False) != False:
            return { 'data': help }

        data = {}
        res = collection.paginate(**db_args)
        if fields:
            rows = [[r.get(k, '') for k in fields] for r in res]
            data['data'] = '\n'.join( [','.join(row) for row in rows] )
        else:
            data['cards'] = list(res)
        return data

    def my_home(self, tdata, **kwargs):
        return self.redirect(tdata.response, abs_url(
            '/' + tdata.user['name'] + '/profile/feed' +
            Community.parse_query(tdata.request.query_string)))
    def profile_redirect(self, tdata, owner_name='', **kwargs):
        return self.redirect(tdata.response, abs_url(
            '/' + owner_name + ('/profile/feed' if owner_name else '') ))
    def user_tag_redirect(self, tdata, owner_name='', tag_name='', **kwargs):
        return self.redirect(tdata.response, abs_url(
            '/' + owner_name + ('/collection/' + tag_name if tag_name else '') ))

    @classmethod
    def parse_query(klass, query_string):
        if query_string:
            return "?" + query_string
        return ""

    def pre_dispatch(self, query, tdata, json=False, **kwargs):
        if query is None:
            return self.serve_404(tdata, json=json)
        # Handle pagination
        # TODO-cleanup: move to another module so routes with
        # pagination aren't forced into community
        db_args = dfilter(tdata.request.args,
            ['at', 'by', 'limit', 'sort', 'order'])
        for k in ['at', 'order']:
            if k in db_args: db_args[k] = int(db_args[k])
        db_args['viewer'] = tdata.user
        # Call controller with route and pagination args
        page_data = query(tdata, db_args=db_args, **kwargs)
        if not page_data:
            print tdata.request
            return self.serve_404(tdata, json=json)
        if(type(page_data) is Response):
            return page_data
            
        page_data.setdefault('title', 'NewHive')

        if type(page_data.get('cards')) is list:
            owner = self.db.User.named(kwargs.get('owner_name',''))
            page_data['cards_route'] = { 'route_args': kwargs,
                'query': tdata.request.args }
            special = page_data.get('special', {})
            if page_data.get('special'):
                del page_data['special']
            if (len(page_data['cards']) > 0 and 
                isinstance(page_data['cards'][0], Entity)):
                page_data['cards'] = [o.client_view(special=special) for o in page_data['cards']]

            for card in page_data['cards']:
                feed = card.get('feed', [])
                card['feed'] = map(lambda x: x.client_view(), feed)

        if json:
            return self.serve_json(tdata.response, page_data)
        elif page_data.has_key('data'):
            return self.serve_data(tdata.response, 'text/txt', page_data['data'])
        else:
            tdata.context.update(page_data=page_data, route_args=kwargs)
            if page_data.get('meta'):
                tdata.context.update(page_data['meta'])
                del page_data['meta']

            return self.serve_page(tdata, 'pages/main.html')

def include_collections(tdata, owner, page_data, **kwargs):
    if not owner: return page_data
    # TODO-perf: don't update list on query, update it when it changes!
    owner.calculate_tags()
    (tag_list, extra_tags) = owner.get_tags(
        tdata.user.id == owner.id and kwargs.get('private'))

    tag_name = kwargs.get('tag_name')
    if tag_name and tag_name not in (tag_list + extra_tags):
        extra_tags.insert(0, tag_name)
    page_data['tag_list'] = tag_list # [:num_tags]
    page_data['extra_tags'] = extra_tags
    if kwargs.get('private') and tdata.user.id == owner.id:
        page_data['tag_entropy'] = owner.get('tag_entropy', {})

    return page_data
