import httplib2, urllib
from newhive import auth, config, mail
from newhive.controllers.controller import ModelController
from newhive.utils import log_error, dfilter, lget

class User(ModelController):
    model_name = 'User'

    def login(self, tdata, request, response):
        authed = auth.handle_login(self.db, request, response)
        if type(authed) == self.db.User.entity: resp = authed.client_view()
        else: resp = False
        return self.serve_json(response, resp)

    def logout(self, tdata, request, response):
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
        if True: # So far, it's always our user, so no need to test: user.id == comment.entity_owner:
            user_view = user.client_view(activity=20)
            resp.update( {'user': {'activity': user_view.get('activity', [])}} )
        return resp

    def comment_create(self, tdata, request, response, **args):
        resp = {}
        user = tdata.user
        expr = self.db.Expr.fetch(request.form.get('entity'))
        if not expr: return self.serve_404(tdata, request, response)
        text = request.form.get('text')
        if text.strip() == '': return False

        comment = self.db.Comment.create(user, expr, {'text': text})
        # TODO: mail settings
        # if user.id != expr.owner.id:
        #     mail.Feed(db=self.db, jinja_env=self.jinja_env).send(comment)
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

    def expr_share(self, tdata, request, response, **args):
        resp = {}
        user = tdata.user
        expr = self.db.Expr.fetch(request.form.get('expr_id'))
        recipient_address = request.form.get('emails')
        if not request.form.get('message') or not recipient_address: return False

        recipient = self.db.User.fetch(recipient_address, keyname='email')
        recipient = recipient or {'email': recipient_address}

        expr.increment({'analytics.email.count': 1})

        log_data = {'service': 'email', 'to': recipient_address, 'expr_id': expr.id}
        # bugbug
        # self.db.ActionLog.create(request.requester, 'share', data=log_data)

        mailer = mail.ShareExpr(self.jinja_env, db=self.db)
        mailer.send(expr, user, recipient, request.form.get('message'), request.form.get('send_copy'))

        return self.serve_json(response, resp)

    def streamified_login(self, tdata, request, response):
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

    def streamified_test(self, tdata, request, response):
        return self.serve_page(tdata, response, 'pages/streamified_test.html')

    def request_invite(self, tdata, request, response, **args):
        form = {
            'name': request.form.get('name')
            ,'email': request.form.get('email').lower()
            ,'referral': request.form.get('referral')
            ,'message': request.form.get('message')
            ,'url': request.form.get('forward')
            }
        if (
            not (form.get('email') and form.get('message')) or
            request.form.get('phone') # value in invisible field means spam
        ):
            return self.serve_json(response, False)

        contact = self.db.Contact.create(form)

        # sending email is non-essential
        try:
            heads = {
                 'To' : 'info@thenewhive.com'
                ,'From' : 'www-data@' + config.server_name
                ,'Subject' : '[home page contact form]'
                ,'Reply-to' : form['email']
                }
            body = "Email: %(email)s\n\nName: %(name)s\n\nHow did you hear about us?\n%(referral)s\n\nHow do you express yourself?\n%(message)s" % form
            try: send_mail(heads, body)
            except Exception as e:
                logger
            sendgrid_args = {'contact_id': contact.id, 'url': form['url']}

            mailer = mail.SignupRequest(db=self.db, jinja_env=self.jinja_env)
            mailer.send(form.get('email'), form.get('name'), sendgrid_args)
        except:
            log_error(request, self.db)

        return self.serve_json(response, True)

    # TODO: hook up & debug
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

    # TODO: hook up & debug
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
    #             # log_error(request, db, message="Error downloading fb profile picture '%s': %s" % (profile_picture_url, e))
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
            # log_error(request, db, message="unable to welcome send email for {}".format(user.get('email')))
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
