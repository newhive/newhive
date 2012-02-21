import crypt, pickle
from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from newhive.utils import normalize, junkstr
from newhive.oauth import FacebookClient
from newhive import mail

class UserController(ApplicationController):

    def index(self, request, response, args={}):
        page = int(request.args.get('page', 0))
        owner = response.context['owner']
        is_owner = request.requester.logged_in and owner.id == request.requester.id
        tags = owner.get('tags', [])
        expressions_tag = {'url': '/expressions', 'name': 'Expressions', 'show_name': False}
        people_tag = {'url': '/listening', 'name': 'Listening'}
        star_tag = {'name': 'Starred', 'url': "/starred", 'img': "/lib/skin/1/star_tab" + ("-down" if request.path == "starred" else "") + ".png"}
        feed_tag = {'url': "/feed", "name": "Feed"}
        response.context['system_tags'] = [expressions_tag, people_tag, star_tag]
        if args.get('listening'):
            tag = people_tag
            response.context['users'] = self.db.User.list({'_id': {'$in': owner.starred_items}})
            response.context['title'] = owner['fullname']
            response.context['tag'] = tag
            response.context['tags'] = map(lambda t: {'url': "/expressions/" + t, 'name': t, 'type': 'user'}, tags)
            if request.requester.logged_in and is_owner:
                response.context['system_tags'].insert(1, feed_tag)
            response.context['profile_thumb'] = owner.thumb
            response.context['starrers'] = map(self.db.User.fetch, owner.starrers)

            return self.serve_page(response, 'pages/expr_cards.html')
        elif args.get('feed'):
            if not request.requester.logged_in:
                return redirect(response, abs_url())
            response.context['feed_items'] = request.requester.feed
            tag = feed_tag

            response.context['title'] = owner['fullname']
            response.context['tag'] = tag
            response.context['tags'] = map(lambda t: {'url': "/expressions/" + t, 'name': t, 'type': 'user'}, tags)
            if request.requester.logged_in and is_owner:
                response.context['system_tags'].insert(1, feed_tag)
            response.context['profile_thumb'] = owner.thumb
            response.context['starrers'] = map(self.db.User.fetch, owner.starrers)

            return self.serve_page(response, 'pages/expr_cards.html')
            #response.context['page'] = page

    def new(self, request, response):
        response.context['action'] = 'create'
        if request.args.has_key('code'):
            fbc = FacebookClient()
            credentials = fbc.exchange(request)
            user_data = fbc.find('https://graph.facebook.com/me')
            response.context['f'] = dfilter(user_data, ['email'])
            response.context['f']['fullname'] = user_data['name']
            response.context['f']['gender'] = {'male': 'M', 'female': 'F'}.get(user_data.get('gender'))
            response.context['f']['facebook'] = user_data
            friends = fbc.fql("""SELECT name,uid FROM user WHERE is_app_user = '1' AND uid IN (SELECT uid2 FROM friend WHERE uid1 =me())""", request.requester.facebook_credentials)['data']
            users = self.db.User.search({'facebook.id': {'$in': [str(friend['uid']) for friend in friends]}})
            response.context['friends'] = users
        else:
            referral = self.db.Referral.fetch(request.args.get('key'), keyname='key')
            if not referral or referral.get('used'): return self._bad_referral(request, response)
        return self.serve_page(response, 'pages/user_settings.html')

    def create(self, request, response):
        """ Checks if the referral code matches one found in database.
            Decrements the referral count of the user who created the referral and checks if the count is > 0.
            Creates user record.
            Creates empty home expression, so user.thenewhive.com does not show 404.
            Creates media directory for user.
            emails thank you for registering to user
            Logs new user in.
            """

        if request.args.has_key('key'):
            referral = self.db.Referral.fetch(request.args.get('key'), keyname='key')
            if (not referral or referral.get('used')): return self._bad_referral(request, response)
            referrer = self.db.User.fetch(referral['user'])
        elif request.args.has_key('code'):
            referral = self.db.Referral.new({})
        assert 'tos' in request.form

        args = dfilter(request.form, ['name', 'password', 'email', 'fullname', 'gender'])
        args.update({
             'referrer' : referral.get('user')
            ,'sites'    : [args['name'].lower() + '.' + config.server_name]
            #,'flags'    : { 'add_invites_on_save' : True }
        })
        if request.form.get('age'): args.update({'birth_year' : datetime.now().year - int(request.form.get('age'))})

        user = self.db.User.create(args)
        self._friends_to_listen(request, user)
        referral.update(used=True, user_created=user.id, user_created_name=user['name'], user_created_date=user['created'])
        user.give_invites(5)
        if request.args.has_key('code'): self._save_credentials(request, user)

        try: mail.mail_user_register_thankyou(self.jinja_env, user)
        except: pass # TODO: log an error

        request.form = dict(username = args['name'], secret = args['password'])
        self.login(request, response)
        return self.redirect(response, abs_url(subdomain=config.site_user) + config.site_pages['welcome'])

    def _friends_to_listen(self, request, user):
        friends = request.form.get('friends_to_listen')
        if friends:
            friends = friends.split(',')
            for friend in self.db.User.search({'facebook.id': {'$in': friends}}):
                self.db.Star.new(user, friend)

    def _save_credentials(self, request, user, fbc=FacebookClient()):
        credentials = fbc.exchange(request)
        if not user.has_key('oauth'): user['oauth'] = {}
        if not user.has_key('facebook'):
            user['facebook'] = fbc.find('https://graph.facebook.com/me')
        user['oauth']['facebook'] = json.loads(credentials.to_json())
        user.save()

    def edit(self, request, response):
        if request.requester.logged_in and request.is_secure:
            fbc = FacebookClient()
            response.context['action'] = 'update'
            response.context['f'] = request.requester
            response.context['facebook_connect_url'] = fbc.authorize_url(abs_url(secure=True)+ 'settings')
            if request.args.has_key('code'):
                self._save_credentials(request, request.requester, fbc)
            if request.requester.facebook_credentials:
                if request.requester.facebook_credentials.access_token_expired:
                    return self.redirect(response, fbc.authorize_url(abs_url(secure=True) + "settings"))
                try:
                    friends = fbc.fql("""SELECT name,uid FROM user WHERE is_app_user = '1' AND uid IN (SELECT uid2 FROM friend WHERE uid1 =me())""", request.requester.facebook_credentials)['data']
                except:
                    return self.redirect(response, fbc.authorize_url(abs_url(secure=True) + "settings"))
                users = self.db.User.search({'facebook.id': {'$in': [str(friend['uid']) for friend in friends]}})
                response.context['listening_count'] = 0
                response.context['friends'] = []
                for user in users:
                    if user.id in request.requester.starred_items:
                        response.context['listening_count'] += 1
                    else:
                        response.context['friends'].append(user)
            return self.serve_page(response, 'pages/user_settings.html')

    def facebook_connect(self, request, response, args={}):
        fbc = FacebookClient()
        self._save_credentials(request, request.requester, fbc)
        response.context['friends'] = fbc.find('https://graph.facebook.com/me/friends')['data']
        friend_ids = [friend['id'] for friend in response.context['friends']]
        response.context['fb_app_id'] = fbc.client_id
        return self.serve_page(response, 'pages/facebook_connect.html')

    def facebook_canvas(self, request, response, args={}):
        params = request.args
        return self.serve_html(response, '<html><script>top.location.href="' + abs_url(secure=True) + 'invited?request_ids=' + str(request.args.get('request_ids')) + '";</script></html>')

    def invited_from_facebook(self, request, response, args={}):
        fbc = FacebookClient()
        params = request.args
        request_ids = request.args.get('request_ids').split(',')
        valid_request = False
        for request_id in request_ids:
            valid_request = valid_request or fbc.find("https://graph.facebook.com/" + str(request_id), app_access=True)
        response.context['facebook_connect_url'] = fbc.authorize_url(abs_url(secure=True) + 'signup')
        if not valid_request:
            msg = "This invite from facebook has already been used. If you " +\
                  "think this is a mistake, please contact us at " +\
                  '<a href="mailto:info@thenewhive.com">info@thenewhive.com</a>'
            return self._bad_referral(request, response, msg=msg)
        return self.serve_page(response, 'pages/invited_from_facebook.html')

    def update(self, request, response):
        message = ''
        user = request.requester
        if not user.cmp_password(request.form.get('old_password')): return self.serve_json(response, {'success': False, 'message': ui.password_change_failure_message})
        if request.form.get('password'):
            if auth.password_change(request, response):
                message = message + ui.password_change_success_message + " "
            else:
                return self.serve_json(response, {'success': False, 'message': ui.password_change_failure_message})
        fullname = request.form.get('fullname')
        if fullname and fullname != request.requester.get('fullname'):
            user.update(fullname=fullname)
            message = message + ui.fullname_change_success_message + " "
        email = request.form.get('email')
        if email and email != request.requester.get('email'):
            user.update(email_confirmation_request_date=time.time())
            mail.mail_email_confirmation(self.jinja_env, user, email)
            message = message + ui.email_change_success_message + " "
        if request.form.get('friends_to_listen'):
            new_friends = len(request.form['friends_to_listen'].split(','))
            self._friends_to_listen(request, user)
            message = message + "You are now listening to " + str(new_friends) + " facebook friend" + ("s " if new_friends > 1 else " ")
        response.context['message'] = message
        request.requester.reload()
        return self.edit(request, response)

    def tag_update(self, request, response):
        tag = lget(normalize(request.form.get('value', '')), 0)
        if not tag: return False
        if request.form.get('action') == 'user_tag_add': request.requester.update_cmd({'$addToSet':{'tags':tag}})
        else: request.requester.update_cmd({'$pull':{'tags':tag}})
        return True


    def profile_thumb_set(self, request, response):
        request.max_content_length = 10000000 # 10 megs
        file = request.files.get('profile_thumb')
        mime = mimetypes.guess_type(file.filename)[0]
        if not mime in ['image/jpeg', 'image/png', 'image/gif']:
            response.context['error'] = "File must be either JPEG, PNG or GIF and be less than 10 MB"

        tmp_file = os.tmpfile()
        file.save(tmp_file)
        res = self.db.File.create(dict(owner=request.requester.id, tmp_file=tmp_file, name=file.filename, mime=mime))
        tmp_file.close()
        request.requester.update(thumb_file_id = res.id, profile_thumb=res.get_thumb(190,190))
        return self.redirect(response, request.form['forward'])

    def password_recovery(self, request, response):
        email = request.form.get('email')
        name = request.form.get('name')
        user = self.db.User.find(dict(email=email, name=name))
        if user:
            password = junkstr(8)
            mail.mail_temporary_password(self.jinja_env, user, password)
            user.set_password(password)
            user.save()
            return self.serve_json(response, {'success': True, 'message': ui.password_recovery_success_message})
        else:
            return self.serve_json(response, {'success': False, 'message': ui.password_recovery_failure_message})

    def user_check(self, request, response):
        user_available = False if self.db.User.named(request.args.get('name')) else True
        return self.serve_json(response, user_available)

    def confirm_email(self, request, response):
        user = self.db.User.fetch(request.args.get('user'))
        email = request.args.get('email')
        if not user:
            response.context.update({'err': 'user record does not exist'})
        if not request.args.get('secret') == crypt.crypt(email, "$6$" + str(int(user.get('email_confirmation_request_date')))):
            response.context.update({'err': 'secret does not match email'})
        else:
            user.flag('confirmed_email')
            user.update(email=email)
            response.context.update({'user': user, 'email': email})
        return self.serve_page(response, "pages/email_confirmation.html")

    def login(self, request, response):
        if auth.handle_login(self.db, request, response):
            return self.redirect(response, request.form.get('url', request.requester.url))

    def logout(self, request, response):
        auth.handle_logout(self.db, request, response)

    def log(self, request, response):
        action = request.form.get('log_action')
        user = request.requester
        if action == "notifications_open":
            user.notification_count = 0

        data = json.loads(request.form.get('data', 'false'))
        if not data:
            data = {}
        l = self.db.ActionLog.new(user, request.form.get('log_action'), data)
        return True

    def _bad_referral(self, request, response, msg=None):
        if request.requester.logged_in: self.redirect(response, request.requester.get_url())
        if not msg: msg = "You have already signed up. If you think this is a " +\
                          "mistake, please try signing up again, or contact us at " +\
                          '<a href="mailto:info@thenewhive.com">info@thenewhive.com</a>'
        response.context['msg'] = msg
        response.context['error'] = 'Log in if you already have an account'
        return self.serve_page(response, 'pages/error.html')


