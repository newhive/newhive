import crypt, pickle, urllib, time
from newhive.controllers.shared import *
from newhive.controllers import Application
from newhive.utils import normalize, junkstr
from newhive.oauth import FacebookClient, FlowExchangeError, AccessTokenCredentialsError
from newhive import mail, auth

import logging
logger = logging.getLogger(__name__)

class User(Application):

    def new(self, request, response):
        if request.requester.logged_in: return self.redirect(response, request.requester.url)
        referral = self._check_referral(request)[0]
        if response.context.has_key('dialog_to_show'):
            response.context.pop('dialog_to_show')
        if (not referral or referral.get('used')): return self._bad_referral(request, response)
        response.context['action'] = 'create'

        if request.args.has_key('code'):
            fb_profile = request.requester.fb_client.me()
            profile_picture_url = 'https://graph.facebook.com/' + fb_profile.get('id') + '/picture?type=large&return_ssl_resources=1'
            try:
                #TODO: switch all uses of urllib to urllib2
                profile_picture = urllib.urlopen(profile_picture_url)
                with os.tmpfile() as tmp_file:
                    tmp_file.write(profile_picture.read())
                    profile_picture = self.db.File.create({
                        'owner': None
                        , 'name': 'profile_picture_for_' + fb_profile.get('name').replace(' ', '_')
                        , 'tmp_file': tmp_file
                        , 'mime': profile_picture.headers.type})
            except IOError as e:
                logger.error("Error downloading fb profile picture '%s': %s", profile_picture_url, e)
                profile_picture = None
            response.context['f'] = dfilter(fb_profile, ['email'])
            response.context['f']['fullname'] = fb_profile['name']
            response.context['f']['gender'] = {'male': 'M', 'female': 'F'}.get(fb_profile.get('gender'))
            response.context['f']['facebook'] = fb_profile
            if profile_picture:
                response.context['f']['thumb'] = profile_picture.get_thumb(190,190)
                response.context['f']['thumb_file_id'] = profile_picture.id
            response.context['friends'] = request.requester.facebook_friends
        else:
            response.context['f']['email'] = referral.get('to', '')

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

        assert 'tos' in request.form
        referral = self._check_referral(request)[0]
        if (not referral or referral.get('used')): return self._bad_referral(request, response)
        referrer = self.db.User.fetch(referral['user'])
        assert referrer, 'Referring user not found'

        args = dfilter(request.form, ['name', 'password', 'email', 'fullname', 'gender', 'thumb', 'thumb_file_id'])
        args.update({
             'referrer' : referrer.id
            ,'sites'    : [args['name'].lower() + '.' + config.server_name]
            ,'email'    : args.get('email').lower()
            #,'flags'    : { 'add_invites_on_save' : True }
        })
        if request.args.has_key('code'):
            credentials = request.requester.fb_client.exchange()
            fb_profile = request.requester.fb_client.me()
            args.update({
                'oauth': {'facebook': json.loads(credentials.to_json())}
                ,'facebook' : fb_profile
            })
        if request.form.get('age'): args.update({'birth_year' : datetime.now().year - int(request.form.get('age'))})

        user = self.db.User.create(args)
        if user.get('referrer') != self.db.User.site_user.id:
            self.db.FriendJoined.create(user, referrer)
        self.db.Star.create(user, self.db.User.site_user)
        self._friends_to_listen(request, user)
        self._friends_not_to_listen(request, user)

        if referral.get('reuse'):
            referral.increment({'reuse': -1})
            referral.update_cmd({'$push': {'users_created': user.id}})
            if referral['reuse'] <= 0: referral.update(used=True)
        else:
            referral.update(used=True, user_created=user.id, user_created_name=user['name'], user_created_date=user['created'])
            contact = self.db.Contact.find({'referral_id': referral.id})
            if contact: contact.update(user_created=user.id)

        user.give_invites(5)
        if args.has_key('thumb_file_id'):
            file = self.db.File.fetch(args.get('thumb_file_id'))
            if file:
                file.update(owner=user.id)

        try: mail.Welcome(db = self.db, jinja_env=self.jinja_env).send(user)
        except: logger.error("unable to welcome send email for {}".format(user.get('email')))

        request.form = dict(username = args['name'], secret = args['password'])
        self.login(request, response)
        return self.redirect(response, abs_url() + config.site_user + '/' + config.site_pages['welcome'] + "?user=" + config.site_user)

    def _check_referral(self, request):
        # Get either key of a Referral object in our db, or a facebook id
        key_or_id = request.args.get('key') or lget(request.path.split('/', 1),1)
        return self.db.Referral.find({ '$or': [{'key': key_or_id}, {'request_id': key_or_id}]}), key_or_id

    def _friends_to_listen(self, request, user):
        friends = request.form.get('friends_to_listen')
        if friends:
            friends = friends.split(',')
            for friend in self.db.User.search({'facebook.id': {'$in': friends}}):
                self.db.Star.create(user, friend)

    def _friends_not_to_listen(self, request, new_user):
        friends = request.form.get('friends_not_to_listen')
        if friends:
            friends = friends.split(',')
            for friend in self.db.User.search({'facebook.id': {'$in': friends}}):
                self.db.FriendJoined.create(new_user, friend)

    def edit(self, request, response):
        if lget(request.path_parts, 0) == "password_recovery":
            key = request.args.get('key')
            user_id = request.args.get('user')
            user = self.db.User.fetch(user_id)
            if not (key and user and user.get('password_recovery') == key): return self._password_recovery_failure(request, response)
            response.context['password_recovery'] = key
            if request.requester.logged_in:
                auth.handle_logout(self.db, request, response)
            if user:
                user.logged_in = True
                request.requester = user
            else:
                return self._password_recovery_failure(request, response)
        else:
            response.context['password_recovery'] = False

        if request.requester.logged_in and request.is_secure:
            response.context['action'] = 'update'
            response.context['f'] = request.requester
            response.context['facebook_connect_url'] = FacebookClient().authorize_url(
                                                           abs_url(secure=True)+ 'settings')
            response.context['email_subscriptions'] = request.requester.get('email_subscriptions'
                    , config.default_email_subscriptions)
            response.context['email_types'] = mail.MetaMailer.unsubscribable('user')
            return self.serve_page(response, 'pages/user_settings.html')
        else: return self.serve_forbidden(response)

    def info(self, request, response):
        user = self.db.User.fetch(lget(request.path_parts, 1))
        if not user: return self.serve_404(request, response)

        items = user.feed_profile(viewer=request.requester, limit=20)
        tmpl = self.jinja_env.get_template('partials/feed.html')
        feed_html = ''.join([ tmpl.render(dict(response.context, feed=item, user=request.requester)) for item in items ])

        exprs = [ { 'id': e.id, 'title': e.get('title'), 'thumb': e.get_thumb(70), 'url': e.url }
            for e in user.expr_page(limit=5) ]

        return self.serve_json(response, dict(
             feed_html = feed_html
            ,exprs = exprs
            ,listening = user.id in request.requester.starred_user_ids
        ))

    def facebook_canvas(self, request, response, args={}):
        return self.serve_html(response, '<html><script>top.location.href="' + abs_url(secure=True) + 'invited' + querystring({'request_ids': request.args.get('request_ids','')}) + '";</script></html>')

    def invited(self, request, response):
        if request.requester.logged_in: return self.redirect(response, request.requester.url)
        if request.args.has_key('key'):
            (referral, key_or_id) = self._check_referral(request)
            if (not referral or referral.get('used')):
                return self._bad_referral(request, response)
            signup_url = abs_url(secure=True) + 'create_account/' + key_or_id
            response.context['facebook_connect_url'] = FacebookClient().authorize_url(signup_url)
            response.context['signup_without_facebook_url'] = signup_url
        else:
            fbc = request.requester.fb_client
            request_ids = request.args.get('request_ids', '').split(',')
            valid_request = False
            for request_id in request_ids:
                if not request_id: continue
                referral = self.db.Referral.find({'request_id': request_id})
                if referral:
                    fb_request = fbc.find("https://graph.facebook.com/" + str(request_id) + "_" + referral.get('to'), app_access=True)
                    if fb_request:
                        fbc.delete("https://graph.facebook.com/" + request_id + "_" + referral.get('to'), app_access=True)
                valid_request = valid_request or ( referral and fb_request and not referral.get('used'))
            #request id is handled as a path rather than querystring so it is preserved through fb redirect
            signup_url = abs_url(secure=True) + 'create_account/' + request_id
            response.context['facebook_connect_url'] = fbc.authorize_url(signup_url)
            response.context['signup_without_facebook_url'] = signup_url
            if not valid_request: return self._bad_referral(request, response)
        return self.serve_page(response, 'pages/invited_from_facebook.html')

    def facebook_invite(self, request, response, args={}):
        request_id = request.form.get('request_id')
        for invite in request.form.get('to').split(','):
            request.requester.new_referral({'to': invite, 'request_id': request_id}, decrement=False)
        return self.serve_json(response, {'success': True})

    def password_recovery_1(self, request, response):
        email = request.form.get('email')
        user = self.db.User.find({'email': email})
        if user:
            key = junkstr(16)
            recovery_link = abs_url(secure=True) + 'password_recovery?key=' + key + '&user=' + user.id
            mail.TemporaryPassword(jinja_env=self.jinja_env, db=self.db).send(user, recovery_link)
            user.update(password_recovery = key)
            return self.serve_json(response, {'success': True, 'message': ui.password_recovery_success_message})
        else:
            return self.serve_json(response, {'success': False, 'message': ui.password_recovery_failure_message})

    def password_recovery_2(self, request, response):
        message = ''
        key = request.args.get('key')
        user_id = request.args.get('user')
        user = self.db.User.fetch(user_id)
        if user.get('password_recovery') != key: return self._password_recovery_failure(request, response)
        request.requester = user
        auth.password_change(request, response, force=True)
        auth.new_session(self.db, user, request, response)
        user.update_cmd({'$unset': {'password_recovery': 1}})
        return self.redirect(response, abs_url())

    def update(self, request, response):
        message = ''
        user = request.requester
        if not user.cmp_password(request.form.get('old_password')):
            return self.serve_json(response, {'success': False, 'message': ui.password_change_failure_message})
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
            request_date = time.time()
            user.update(email_confirmation_request_date=request_date)
            mail.EmailConfirmation(db=self.db, jinja_env=self.jinja_env).send(user, email, request_date)
            message = message + ui.email_change_success_message + " "
        if request.form.get('friends_to_listen'):
            new_friends = len(request.form['friends_to_listen'].split(','))
            self._friends_to_listen(request, user)
            message = message + "You are now listening to " + str(new_friends) + " facebook friend" + ("s " if new_friends > 1 else " ")
        if request.form.get('fb_disconnect'):
            message = message + "Your Facebook account has been disconnected. This means you'll have to sign in using your New Hive username and password in the future."
            user.facebook_disconnect()
            user.reload()
        email_subscriptions = [x for x in request.form.items() if x[1] == 'on' and x[0].startswith('email_')]
        email_subscriptions = [x[0].split('_',1)[1] for x in email_subscriptions]
        if email_subscriptions != request.requester.get('email_subscriptions'):
            user.update(email_subscriptions=email_subscriptions)
            message = message + ui.email_subscription_change_success_message + " "
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
        file = request.files.get('file')
        mime = mimetypes.guess_type(file.filename)[0]
        if not mime in ['image/jpeg', 'image/png', 'image/gif']:
            response.context['error'] = "File must be either JPEG, PNG or GIF and be less than 10 MB"

        with os.tmpfile() as tmp_file:
            file.save(tmp_file)
            res = self.db.File.create(dict(owner=request.requester.id, tmp_file=tmp_file, name=file.filename, mime=mime))

        request.requester.update(thumb_file_id = res.id, profile_thumb=res.get_thumb(190,190))
        return { 'name': file.filename, 'mime' : mime, 'file_id' : res.id, 'url' : res.get('url'), 'thumb': res.get_thumb(190,190) }

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
        success = auth.handle_login(self.db, request, response)
        if success:
            if request.is_xhr: return self.serve_json(response, {'login': True})
            return self.redirect( response, request.form.get('url', abs_url()) )

    def logout(self, request, response):
        auth.handle_logout(self.db, request, response)
        return self.redirect( response, request.form.get('url', abs_url()) )

    def log(self, request, response):
        action = request.form.get('log_action')
        user = request.requester
        if action == "notifications_open":
            user.notification_count_reset()

        data = json.loads(request.form.get('data', 'false'))
        if not data:
            data = {}
        l = self.db.ActionLog.create(user, request.form.get('log_action'), data)
        return True

    def _bad_referral(self, request, response, msg=None):
        if request.requester.logged_in: self.redirect(response, request.requester.get_url())
        if not msg: msg = "This invite has already been used. If you think this is a " +\
                          "mistake, please try signing up again, or contact us at " +\
                          '<a href="mailto:info@thenewhive.com">info@thenewhive.com</a>'
        response.context['msg'] = msg
        response.context['error'] = 'Log in if you already have an account'
        return self.serve_page(response, 'pages/error.html')

    def _password_recovery_failure(self, request, response):
        response.context['msg'] = ui.invalid_password_recovery_link
        return self.serve_page(response, 'pages/error.html')


    def facebook_listen(self, request, response, args=None):
        t0 = time.time()
        friends = None
        try:
            friends = list(request.requester.facebook_friends)
        except AccessTokenCredentialsError:
            try:
                credentials = request.requester.fb_client.exchange()
                if credentials: request.requester.save_credentials(credentials)
                friends = list(request.requester.facebook_friends)
            except (AccessTokenCredentialsError, FlowExchangeError) as e:
                logger.error("Error generating friends to listen dialog for '%s': %s", request.requester['name'], e)
                response.context['error'] = 'Something went wrong finding your friends.  You may need to log in to facebook to continue'
        except FlowExchangeError as e:
            logger.error("Error generating friends to listen dialog for '%s': %s", request.requester['name'], e)
            response.context['error'] = 'Something went wrong finding your friends.  You may need to log in to facebook to continue'
        if friends and len(friends):
            response.context['friends'] = friends
        logger.debug('Facebook listen response time %d ms', (time.time() - t0)*1000)
        return self.serve_page(response, 'dialogs/facebook_listen.html')

    def unsubscribe_form(self, request, response):
        email = self.db.MailLog.fetch(request.args.get('email_id'))
        response.context['email'] = email.get('email')
        response.context['initiator'] = self.db.User.fetch(email.get('initiator'))
        return self.serve_page(response, 'pages/unsubscribe.html')

    def unsubscribe(self, request, response):
        email = self.db.MailLog.fetch(request.args.get('email_id'))
        email_addr = email['email']
        unsub = self.db.Unsubscribes.fetch_empty(email_addr, keyname='email')
        type = request.form.get('unsubscribe')
        if type == 'user':
            unsub.update_cmd({'$set': {'email': email_addr}, '$push': {'users': request.form.get('user')}}, upsert=True)
        elif type == 'all':
            unsub.update_cmd({'$set': {'all': True, 'email': email_addr}}, upsert=True)
        email.update(unsubscribe=type, unsubscribe_date=now())
        response_dict = {'type': type, 'name': request.form.get('username')}
        return self.serve_json(response, response_dict)
