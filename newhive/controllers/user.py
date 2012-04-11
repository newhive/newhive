import crypt, pickle, urllib
from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from newhive.utils import normalize, junkstr
from newhive.oauth import FacebookClient, FlowExchangeError, AccessTokenCredentialsError
from newhive import mail

import logging
logger = logging.getLogger(__name__)

class UserController(ApplicationController):

    def new(self, request, response):
        if request.requester.logged_in: return self.redirect(response, request.requester.url)
        referral = self._check_referral(request)[0]
        if response.context.has_key('dialog_to_show'):
            response.context.pop('dialog_to_show')
        if not referral:
            referral = self._check_referral(request)[0]
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
        referral.update(used=True, user_created=user.id, user_created_name=user['name'], user_created_date=user['created'])
        user.give_invites(5)
        if args.has_key('thumb_file_id'):
            file = self.db.File.fetch(args.get('thumb_file_id'))
            if file:
                file.update(owner=user.id)

        try: mail.mail_user_register_thankyou(self.jinja_env, user)
        except: pass # TODO: log an error

        request.form = dict(username = args['name'], secret = args['password'])
        self.login(request, response)
        return self.redirect(response, abs_url(subdomain=config.site_user) + config.site_pages['welcome'])

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
        if request.requester.logged_in and request.is_secure:
            response.context['action'] = 'update'
            response.context['f'] = request.requester
            response.context['facebook_connect_url'] = FacebookClient().authorize_url(
                                                           abs_url(secure=True)+ 'settings')
            return self.serve_page(response, 'pages/user_settings.html')

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
                fb_request = fbc.find("https://graph.facebook.com/" + str(request_id), app_access=True)
                if fb_request:
                    referral = self.db.Referral.find({'request_id': request_id})
                    if referral:
                        fbc.delete("https://graph.facebook.com/" + request_id + "_" + referral.get('to'), app_access=True)
                valid_request = valid_request or (fb_request and referral and not referral.get('used'))
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
        if request.form.get('fb_disconnect'):
            message = message + "Your Facebook account has been disconnected. This means you'll have to sign in using your New Hive username and password in the future."
            user.facebook_disconnect()
            user.reload()
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

        tmp_file = os.tmpfile()
        file.save(tmp_file)
        res = self.db.File.create(dict(owner=request.requester.id, tmp_file=tmp_file, name=file.filename, mime=mime))
        tmp_file.close()
        request.requester.update(thumb_file_id = res.id, profile_thumb=res.get_thumb(190,190))
        return { 'name': file.filename, 'mime' : mime, 'file_id' : res.id, 'url' : res.get('url'), 'thumb': res.get_thumb(190,190) }

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

    def facebook_listen(self, request, response, args=None):
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
        return self.serve_page(response, 'dialogs/facebook_listen.html')
