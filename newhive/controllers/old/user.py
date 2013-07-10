import crypt, urllib, time
from newhive.controllers.shared import *
from newhive.controllers import Application
from newhive.utils import normalize, junkstr
from newhive.oauth import FacebookClient, FlowExchangeError, AccessTokenCredentialsError
from newhive import mail, auth

import logging
logger = logging.getLogger(__name__)

class User(Application):
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

