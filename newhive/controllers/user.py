import httplib2, urllib
from newhive import auth, config, mail
from newhive.controllers.controller import ModelController
from newhive.utils import log_error, dfilter, lget, abs_url

class User(ModelController):
    model_name = 'User'

    def bugbug(self, tdata, request, response, **args):
        1/0
        return self.serve_json(response, resp)

    def login(self, tdata, request, response, **args):
        authed = auth.handle_login(self.db, request, response)
        if type(authed) == self.db.User.entity: resp = authed.client_view()
        else: resp = False
        return self.redirect(response, request.form.get('from') or abs_url())
        # return self.serve_json(response, resp)

    def logout(self, tdata, request, response, **args):
        auth.handle_logout(self.db, tdata.user, request, response)
        return self.serve_json(response, True)

    # edit or delete comment
    def comment_edit(self, tdata, request, response, **args):
        resp = {}
        user = tdata.user
        text = request.form.get('text')
        deletion = request.form.get('deletion')
        comment_id = request.form.get('id')
        comment = self.db.Comment.fetch(comment_id)
        # delete or update comment
        if deletion == "delete":
            comment.delete()
        else:
            comment['text'] = text
            comment.save()

        # refetch activity and sent to client
        expr = self.db.Expr.fetch(comment.get('entity'))
        resp.update( self.get_expr_activity(expr, user) )
        return self.serve_json(response, resp)

    def get_expr_activity(self, expr, user):
        resp = {}
        expr_view = expr.client_view(activity=10)
        resp.update( {'activity': expr_view.get('activity', [])} )
        resp.update( {'comments': expr.comment_feed()} )
        if True: # So far, it's always our user, so no need to test: user.id == comment.entity_owner:
            user_view = user.client_view(activity=20)
            resp.update( {'user': {'activity': user_view.get('activity', [])}} )
        return resp

    def comment_create(self, tdata, request, response, **args):
        resp = {}
        user = tdata.user
        eid = request.form.get('entity')
        
        expr = self.db.Expr.fetch(eid)
        if not expr or user['_id'] == None: 
            return self.serve_404(tdata, request, response)
        text = request.form.get('text')
        if text.strip() == '': return False

        comment = self.db.Comment.create(user, expr, {'text': text})
        # mail settings
        if user.id != expr.owner.id:
            mail.Feed(db=self.db, jinja_env=self.jinja_env).send(comment)
        resp.update( self.get_expr_activity(expr, user) )
        return self.serve_json(response, resp)

    def tag_follow(self, tdata, request, response, **args):
        resp = {}
        user = tdata.user
        tag = request.form.get('tag')
        action = request.form.get('action', 'set')

        following = user.get('tags_following', [])
        # print tag + " " + action + " " + ', '.join(following)
        if (following.count(tag) > 0):
            if (action in ["toggle", "unset"] ):
                following.remove(tag)
        else: 
            if (action in ["toggle", "set"] ):
                following.append(tag)
                following.sort()
        user.update(tags_following=following)
        resp['tags'] = following

        return self.serve_json(response, resp)

    def star_unstar(self, tdata, request, response, **args):
        """Star/listen or unstar/unlisten an expression or profile
        """
        resp = {}
        user = tdata.user
        # requested state
        state = request.form.get('state') != 'false'
        eid = request.form.get('entity')

        entity = self.db.Expr.fetch(eid)
        if not entity: entity = self.db.User.fetch(eid)
        if not entity: return self.serve_404(request, response)

        s = self.db.Star.find({'initiator': user.id, 'entity': entity.id})
        if not state:
            if s: s.delete()
        else:
            if not s: s = self.db.Star.create(user, entity)

        resp.update({'state': state, 'entity': eid})
        return self.serve_json(response, resp)

    def broadcast(self, tdata, request, response, **args):
        resp = {}
        user = tdata.user
        # requested state
        state = request.form.get('state') != 'false'
        eid = request.form.get('entity')

        entity = self.db.Expr.fetch(eid)
        if not entity: return self.serve_404(request, response)

        s = self.db.Broadcast.find({ 'initiator': user.id, 'entity': entity.id })
        if not state:
           if s: res = s.delete()
        else:
           if not s: s = self.db.Broadcast.create(user, entity)

        resp.update({'state': state, 'entity': eid})
        return self.serve_json(response, resp)

    def expr_share(self, tdata, request, response, **args):
        resp = {}
        user = tdata.user
        expr = self.db.Expr.fetch(request.form.get('expr_id'))
        recipient_address = request.form.get('emails')
        if not request.form.get('message') or not recipient_address: 
            return self.serve_json(response, { 'error': 'Message and recipient are mandatory fields.'})

        recipient = self.db.User.fetch(recipient_address, keyname='email')
        recipient = recipient or {'email': recipient_address}

        expr.increment({'analytics.email.count': 1})

        log_data = {'service': 'email', 'to': recipient_address, 'expr_id': expr.id}
        # bugbug
        # self.db.ActionLog.create(request.requester, 'share', data=log_data)

        mailer = mail.ShareExpr(self.jinja_env, db=self.db)
        mailer.send(expr, user, recipient, request.form.get('message'), 
            request.form.get('send_copy'))

        return self.serve_json(response, resp)

    def send_mail(self, tdata, request, response, **args):
        resp = {}
        user = tdata.user
        recipient_id = request.form.get('user_id')
        message = request.form.get('message')
        send_copy = (request.form.get('send_copy') == 'on')

        recipient = self.db.User.fetch(recipient_id)
        if not recipient:
            return self.serve_json(response, 
                { 'error': 'Invalid recipient.' })
        recipient_email = recipient['email']
        if not recipient_email:
            return self.serve_json(response, 
                { 'error': 'Recipient has no valid email address.' })

        if not message:
            return self.serve_json(response, 
                { 'error': 'Empty message. Please type a message in the box.' })

        mailer = mail.SendMail(self.jinja_env, db=self.db)
        mailer.send(recipient, user, message, send_copy)

        return self.serve_json(response, resp)

    def notification_reset(self, tdata, request, response, **args):
        tdata.user.notification_count_reset()
        return self.serve_json(response, True)

    def activity(self, tdata, request, response, **args):
        notify = tdata.user.notification_count
        res = { 'notification_count': notify }
        if notify: res['activity'] = [f.client_view()
            for f in list(tdata.user.activity(limit=20))]
        return self.serve_json(response, res)

    def streamified_login(self, tdata, request, response, **args):
        streamified_username = request.args['usernames'].split(',')[0]

        post = {
            'code': request.args['code'],
            'grant_type': 'authorization_code',
            'redirect_uri': abs_url(secure=True) + 'streamified_login',
            'scope': streamified_username,
            'client_id': config.streamified_client_id,
            'client_secret': config.streamified_client_secret,
        }
        headers = { 'content-type': 'application/x-www-form-urlencoded', }

        body = urllib.urlencode(post)
        print config.streamified_url + 'oauth/access_token', body
        http = httplib2.Http(timeout=0.5, disable_ssl_certificate_validation=True)
        resp, content = http.request(config.streamified_url + 'oauth/access_token',
            method='POST', body=body, headers=headers)

        print (resp, content)
        
        return self.serve_page(tdata, response, 'pages/streamified_login.html')

    def streamified_test(self, tdata, request, response, **args):
        return self.serve_page(tdata, response, 'pages/streamified_test.html')

    def request_invite(self, tdata, request, response, **args):
        form = {
            'name': request.form.get('name')
            ,'email': request.form.get('email').lower()
            ,'referral': request.form.get('referral')
            ,'message': request.form.get('message')
            ,'url': request.form.get('forward')
            }
        if (not (form.get('email') and form.get('message')) or
            request.form.get('phone') # value in invisible field means spam
        ):
            return self.serve_json(response, False)

        contact = self.db.Contact.create(form)

        # sending email is non-essential
        try:
            sendgrid_args = {'contact_id': contact.id, 'url': form['url']}

            mailer = mail.SignupRequest(db=self.db, jinja_env=self.jinja_env)
            mailer.send(form.get('email'), form.get('name'), sendgrid_args)
        except:
            log_error(self.db, request=request)

        return self.serve_json(response, True)

    # TODO-hookup & test
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
    def _password_recovery_failure(self, request, response):
        response.context['msg'] = ui.invalid_password_recovery_link
        return self.serve_page(response, 'pages/error.html')

    # TODO-hookup & test
    def user_referral(self, request, response):
        user = request.requester
        mailer = mail.UserReferral(db=self.db, jinja_env=self.jinja_env)
        for i in range(0,4):
            name = request.form.get('name_' + str(i))
            to_email = request.form.get('to_' + str(i))
            if user['referrals'] <= 0 or not to_email or len(to_email) == 0: break
            referral = user.new_referral({'name': name, 'to': to_email})
            mailer.send(referral, user)

        return self.redirect(response, request.form.get('forward'))

    # TODO-hookup & test
    def mail_feedback(self, request, response):
        if not request.form.get('message'): return serve_error(response, 'Sorry, there was a problem sending your message.')
        feedback_address = 'bugs+feedback@' + config.server_name 
        user_email = request.requester.get('email', '')
        heads = {
             'To' : feedback_address
            ,'From' : user_email
            ,'Subject' : 'Feedback from ' + request.requester.get('name') + ' - ' + request.requester.get('fullname', '')
            ,'Reply-to' : ', '.join([ feedback_address, user_email ])
            }
        url = url_unquote(request.args.get('url', ''))
        body = (
            request.form.get('message')
            + "\n\n----------------------------------------\n\n"
            + url + "\n"
            + 'User-Agent: ' + request.headers.get('User-Agent', '') + "\n"
            + 'From: ' + request.requester.get('email', '') +' - '+ request.requester.url
            + "\n\n"
            )
        print send_mail(heads, body)
        if request.form.get('send_copy'):
            heads.update( To = user_email, From = feedback_address )
            print heads
            send_mail( heads, body, category = 'mail_feedback' )
        response.context['success'] = True

    # TODO-hookup & test
    def unsubscribe_form(self, request, response):
        email = self.db.MailLog.fetch(request.args.get('email_id'))
        response.context['email'] = email.get('email')
        response.context['initiator'] = self.db.User.fetch(email.get('initiator'))
        return self.serve_page(response, 'pages/unsubscribe.html')

    # TODO-hookup & test
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

    # TODO-hookup & test
    def name_check(self, request, response):
        user_available = False if self.db.User.named(request.args.get('name')) else True
        return self.serve_json(response, user_available)

    # TODO-hookup & test
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

    # def newxxxxxxxxxx(self, request, response):
    #     if request.requester.logged_in: return self.redirect(response, request.requester.url)
    #     referral = self._check_referral(request)[0]
    #     if response.context.has_key('dialog_to_show'):
    #         response.context.pop('dialog_to_show')
    #     if (not referral or referral.get('used')): return self._bad_referral(tdata, request, response)
    #     response.context['action'] = 'create'
    #     redirect_url = URL(request.url)
    #     redirect_url.query.clear()
    #     response.context['facebook_connect_url'] = FacebookClient().authorize_url(redirect_url)

    #     if request.args.has_key('code'):
    #         credentials = request.requester.fb_client.credentials
    #         credential_store = self.db.Temp.create( json.loads(credentials.to_json()) )
    #         fb_profile = request.requester.fb_client.me()
    #         profile_picture_url = 'https://graph.facebook.com/' + fb_profile.get('id') + '/picture?type=large&return_ssl_resources=1'
    #         try:
    #             #TODO: switch all uses of urllib to urllib2
    #             profile_picture = urllib.urlopen(profile_picture_url)
    #             with os.tmpfile() as tmp_file:
    #                 tmp_file.write(profile_picture.read())
    #                 profile_picture = self.db.File.create({
    #                     'owner': None
    #                     , 'name': 'profile_picture_for_' + fb_profile.get('name').replace(' ', '_')
    #                     , 'tmp_file': tmp_file
    #                     , 'mime': profile_picture.headers.type})
    #         except IOError as e:
    #             # log_error(db, request=request, message="Error downloading fb profile picture '%s': %s" % (profile_picture_url, e))
    #             profile_picture = None
    #         response.context['f'] = dfilter(fb_profile, ['email'])
    #         response.context['f']['fullname'] = fb_profile['name']
    #         response.context['f']['gender'] = {'male': 'M', 'female': 'F'}.get(fb_profile.get('gender'))
    #         response.context['f']['facebook'] = fb_profile
    #         response.context['f']['credential_id'] = credential_store.id
    #         if profile_picture:
    #             response.context['f']['thumb'] = profile_picture.get_thumb(190,190)
    #             response.context['f']['thumb_file_id'] = profile_picture.id
    #         response.context['friends'] = request.requester.facebook_friends
    #     else:
    #         response.context['f']['email'] = referral.get('to', '')

    #     return self.serve_page(tdata, response, 'pages/signup.html')

    def create(self, tdata, request, response):
        """ Checks if the referral code matches one found in database.
            Decrements the referral count of the user who created the referral and checks if the count is > 0.
            Creates user record.
            Creates empty home expression, so user.thenewhive.com does not show 404.
            Creates media directory for user.
            emails thank you for registering to user
            Logs new user in.
            """

        assert 'agree' in request.form
        referral = self._check_referral(request)[0]
        if (not referral): return self._bad_referral(tdata, request, response)
        # BUGBUG
        # if (not referral or referral.get('used')): return self._bad_referral(tdatakkkk, request, response)
        referrer = self.db.User.named(referral['name'])
        assert referrer, 'Referring user not found'

        args = dfilter(request.form, ['username', 'password', 'email', 'fullname', 'gender', 'thumb', 'thumb_file_id'])
        args.update({
             'referrer' : referrer.id
            ,'sites'    : [args['username'].lower() + '.' + config.server_name]
            ,'email'   : args.get('email').lower()
            ,'name'    : args['username']
            #,'flags'    : { 'add_invites_on_save' : True }
        })
        if not args.get('fullname'): args['fullname'] = args['username']
        credential_id = request.form.get('credential_id')
        if credential_id:
            credentials = self.db.Temp.fetch(credential_id)
            request.requester.fb_client.credentials = credentials
            fb_profile = request.requester.fb_client.me()
            args.update({
                'oauth': {'facebook': credentials}
                ,'facebook' : fb_profile
            })
        if request.form.get('age'): args.update({'birth_year' : datetime.now().year - int(request.form.get('age'))})

        try:
            user = self.db.User.create(args)
        except Exception, e:
            return self.serve_json(response, { 'error':'username exists or invalid username' })

        if user.get('referrer') != self.db.User.site_user.id:
            self.db.FriendJoined.create(user, referrer)
        # new user follows NewHive
        # TODO: follow referrer, offer suggested users to follow.
        self.db.Star.create(user, self.db.User.site_user)
        # self._friends_to_listen(request, user)
        # self._friends_not_to_listen(request, user)

        if referral.get('reuse'):
            referral.increment({'reuse': -1})
            referral.update_cmd({'$push': {'users_created': user.id}})
            if referral['reuse'] <= 0: referral.update(used=True)
        else:
            referral.update(used=True, user_created=user.id, user_created_name=user['name'], user_created_date=user['created'])
            contact = self.db.Contact.find({'referral_id': referral.id})
            if contact: contact.update(user_created=user.id)

        user.give_invites(config.initial_invite_count)
        if args.has_key('thumb_file_id'):
            file = self.db.File.fetch(args.get('thumb_file_id'))
            if file:
                file.update(owner=user.id)

        try: mail.Welcome(db = self.db, jinja_env=self.jinja_env).send(user)
        except: 
            # log_error(db, request=request, message="unable to welcome send email for {}".format(user.get('email')))
            pass

        request.form = dict(username = args['username'], secret = args['password'])
        self.login(tdata, request, response)
        return self.redirect(response, '/' + user['name'] + '/profile')

    def _bad_referral(self, tdata, request, response, msg=None):
        # if request.requester.logged_in: self.redirect(response, request.requester.get_url())
        # if not msg: msg = "This invite has already been used. If you think this is a " +\
        #                   "mistake, please try signing up again, or contact us at " +\
        #                   '<a href="mailto:info@thenewhive.com">info@thenewhive.com</a>'
        # response.context['msg'] = msg
        # response.context['error'] = 'Log in if you already have an account'
        return self.serve_page(tdata, response, 'pages/exception.html')

    def _check_referral(self, request):
        # Get either key of a Referral object in our db, or a facebook id
        key_or_id = request.args.get('key') or lget(request.path.split('/', 1),1)
        # BUGBUG
        key_or_id ='Z9o7Rr2XyIS45Rq2'
        #
        return self.db.Referral.find({ '$or': [{'key': key_or_id}, {'request_id': key_or_id}]}), key_or_id
