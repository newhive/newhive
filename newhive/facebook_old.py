from newhive.oauth import FacebookClient

class Application(object):
    def pre_process(self, request):
        self._process_facebook(request, response)

    def _process_facebook(self, request, response):
        # in order to get facebook credentials we use the following order of
        # preference:
        # 
        # 1) use token stored in user record if still valid
        # 2) get new token from fbsr cookie set by fb js sdk
        # 3) if absolutely necessary get new token via redirect
        user = request.requester
        fb_cookie = self._get_fb_cookie(request)
        user.fb_client = FacebookClient(user=user)

        # if the user object has stored credentials from the database and they are
        # still valid, give these to the fb_client
        if user.facebook_credentials and not user.facebook_credentials.access_token_expired:
            user.fb_client.credentials = user.facebook_credentials

        # If user object has no valid credentials, and also as a backup, we store an
        # oauth code, which can be exchanged later for an access token.  if the
        # request includes a code in the argument, prefer this, because it probably
        # just came from facebook via a redirect, rather than the cookie set by the
        # javascript sdk, which could be older
        if request.args.has_key('code'):
            user.fb_client.add_auth(request.args['code'], abs_url(request.path, secure=request.is_secure))
        if fb_cookie and fb_cookie.get('user_id') == user.facebook_id:
            user.fb_client.add_auth(fb_cookie.get('code'), '')

        response.context.update({ 'new_fb_connect': False })
        if request.args.has_key('code') and not request.form.get('fb_disconnect'):
            if request.requester.logged_in:
                # if logged in, then connect facebook account if not already connected
                if not request.requester.has_facebook:
                    credentials = request.requester.fb_client.exchange()
                    profile = request.requester.fb_client.me()
                    # Don't save credentials if a user already exists with this facebook id
                    existing_user = self.db.User.find_by_facebook(profile.get('id'))
                    if not existing_user:
                        logger.info("Connecting facebook account '%s' to TNH account '%s'", profile['name'], request.requester['name'])
                        request.requester.save_credentials(credentials, profile=True)
                        response.context['new_fb_connect'] = True
                    else:
                        logger.warn("Not connecting facebook account '%s' to TNH account '%s' because account is already connected to '%s'",
                                                                         profile['name'], request.requester['name'], existing_user['name'])
                        response.context['existing_user'] = existing_user
                        response.context['facebook_name'] = profile['name']
                        self.show_dialog(response, '#dia_fb_account_duplicate')
            else:
                # if not logged in, try logging in with facebook credentials
                fb_client = request.requester.fb_client
                request.requester = auth.facebook_login(self.db, request, response)

                # instread of continuing with request, redirect with user
                # logged in. this gets rid of ugly querystring, and also fixes
                # bug we were having in August 2012 where the current request
                # didn't act as if logged in.
                if request.requester.logged_in:
                    self.redirect(response, abs_url(request.path))
                fb_client.user = request.requester
                request.requester.fb_client = fb_client
                if not request.requester.id: self.show_dialog(response, '#dia_sign_in_or_join')


    def _get_fb_cookie(self, request):
        cookie = auth.get_cookie(request, 'fbsr_' + config.facebook_app_id)
        if cookie:
            sig, data = [b64decode(str(el)) for el in cookie.split('.')]
            #TODO: check data against signature hash
            return json.loads(data)
        else:
            return None
