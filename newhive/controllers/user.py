import httplib2, urllib, re, json
from newhive import auth, config, mail
from newhive.controllers.controller import ModelController
from newhive.utils import (log_error, dfilter, lget, abs_url, junkstr,
    set_cookie, rm_cookie)
from newhive.state import Entity, collection_client_view

class User(ModelController):
    model_name = 'User'

    def bugbug(self, tdata, request, response, **args):
        1/0
        return self.serve_json(response, resp)

    def login(self, tdata, request, response, **args):
        error = False
        if tdata.user.logged_in:
            resp = tdata.user.client_view()
        else:
            authed = auth.handle_login(self.db, request, response)
            if type(authed) == self.db.User.entity: 
                resp = authed.client_view()
            else: 
                resp = { 'error': 'Incorrect username or password.' }
                error = "login"

        if request.args.get('json') or request.form.get('json'):
            return self.serve_json(response, resp)

        query = ""
        if error:
            query = "#error=" + error
        return self.redirect( response, (request.form.get('from')
            or abs_url()) + query )

    def logout(self, tdata, request, response, **args):
        auth.handle_logout(self.db, tdata.user, request, response)
        return self.serve_json(response, True)

    def content_login(self, tdata, request, response, **args):
        # currently for flags only, intentionally not secure
        session = request.args.get('session')
        print 'session arg: ', session
        set_cookie(response, 'session', session)
        # return sparse user record
        return self.serve_json(response, { 'session': {'id': session} })
    def content_logout(self, tdata, request, response, **args):
        rm_cookie(response, 'session')
        return self.serve_json(response, {})

    def tag_order(self, tdata, request, response, **args):
        tag_order = request.form.get('tag_order').split(",")
        tag_order = [t for t in tag_order if t != '']
        user = tdata.user

        if not user or not user.logged_in:
            return self.serve_json(response, { 'error': 'error'})

        update = {}
        user.update(ordered_tags=tag_order)
        (update['tag_list'], update['extra_tags']) = user.get_tags(True)

        return self.serve_json(response, update)

    def collection_users(self, tdata, request, response, **args):
        owner_name = args.get("owner_name")
        tag_name = args.get("tag_name")
        user = self.db.User.named(owner_name)
        if not user: return self.serve_json(response, False)

        old_order = user.get_tag(tag_name)
        exprs = self.db.Expr.fetch(old_order[:40])
        # First user is the owner
        seen = set([user.id])
        users = [user.client_view()]
        for expr in exprs:
            user = expr.owner
            # Include users in the order they are in the collection, no dupes.
            if user.id in seen:
                continue
            seen.add(user.id)
            users.append(user.client_view())
            if len(seen) > 6:
                break

        return self.serve_json(response, users)

    def collection_order(self, tdata, request, response, **args):
        is_category = (request.form.get('type') == 'categories')
        new_order = json.loads(request.form.get('new_order'))
        new_order = [t for t in new_order if t]

        tag_name = request.form.get('tag_name')
        deletes = int(request.form.get('deletes'))
        user = tdata.user

        if not user or not user.logged_in or not tag_name:
            return self.serve_json(response, { 'error': 'error'})

        if is_category:
            old_order = user.get_category_collections(tag_name)
        else:
            tagged = user.get('tagged', {})
            old_order = user.get_tag(tag_name, force_update=True)

        new_order += old_order[len(new_order) + deletes:]

        if is_category:
            if len(new_order):
                user.set_category_collections(tag_name, new_order)
                # Request the first item get an ultra snapshot if user == root_user
                if user.id == self.db.User.root_user.id:
                    collection_client_view(self.db, new_order[0], True)
            else:
                user.remove_category(tag_name)
        else:
            # remove the tag on owned expression
            #if tag_name not in ['remixed']:
            removed = set(old_order) - set(new_order)
            for expr_id in removed:
                expr = self.db.Expr.fetch(expr_id)
                if expr and expr.owner.id == user.id:
                    expr.update(updated=False, tags=re.sub(
                        ' ?#?' + tag_name + ' ?',' ',expr.get('tags','')).strip())
            if len(new_order):
                tagged[tag_name] = new_order
            else:
                del tagged[tag_name]
            user.update(tagged=tagged)

        return self.serve_json(response, True)

    def add_to_collection(self, tdata, request, response, **args):
        if not tdata.user.logged_in:
            return self.serve_json(response, { 'error': 'needs_login'})
        tag_name = request.form.get('tag_name')
        expr_id = request.form.get('expr_id')

        if request.form.get('type') == "categories":
            if expr_id:
                expr = self.db.Expr.fetch(expr_id)
                if not expr or not tag_name:
                    return self.serve_json(response, { 'error': 'error'})

                tdata.user.add_to_category(tag_name, expr_id)
            else:
                user_id = request.form.get('user_id')
                user = self.db.User.fetch(user_id)
                col_name = request.form.get('col_name')
                if not user or not tag_name:
                    return self.serve_json(response, { 'error': 'error'})

                col = user.make_collection(col_name)
                tdata.user.add_to_category(tag_name, col)
        else:
            user = tdata.user
            expr = self.db.Expr.fetch(expr_id)

            if not user or not user.logged_in or not tag_name or not expr:
                return self.serve_json(response, { 'error': 'error'})

            user.add_to_collection(expr_id, tag_name)

        return self.serve_json(response, True)

    def do_password_reset(self, tdata, request, response, owner_name=None, **args):
        # Check to see if user filled out password recovery form
        key = request.form.get('key')
        if key:
            user_id = request.form.get('user_id', '')
            user = self.db.User.fetch(user_id)
            password = request.form.get('new_password', '')
            password2 = request.form.get('new_password2', '')

            resp = {}
            if not user:
                resp.update({ 'error': 'User not found.' })
            elif key != user.get('password_recovery'):
                resp.update({ 'error': 'Incorrect or already used key.' })
            elif password != password2:
                resp.update({ 'error': 'Passwords must match.' })
            elif user.check_password(password):
                resp.update({ 'error': user.check_password(password) })
            else:
                user.update(**{'password': password})
                user.update_cmd({'$unset': {'password_recovery': 1}})
                auth.new_session(self.db, user, request, response)

            resp.update({"page_data":"must have some data or else 404"})
            return self.serve_json(response, resp)

    # User has requested a new password. Send a reset email
    def password_recover(self, tdata, request, response, **args):
        resp = {}
        logged_user = tdata.user
        email = request.form.get('email')
        users = list(self.db.User.search({'email': email}))

        if logged_user and logged_user.id:
            resp = { 'error': 'Already logged in.' }
        elif not users:
            resp = { 'error': 'Sorry, that email address is not in our records.' }
        else:
            for user in users:
                key = junkstr(16)
                user.recovery_link = (abs_url(secure=True)
                    + "home/password_reset?key="
                    + key + '&user=' + user.id
                )
                user.update(password_recovery = key)
            mail.TemporaryPassword(jinja_env=self.jinja_env, db=self.db
                ).send(users)
        return self.serve_json(response, resp)

    # Show password reset dialog, filled with user name 
    def password_reset(self, tdata, request, response, **args):
        resp = { 'page': 'password_reset' }
        logged_user = tdata.user
        key = request.args.get('key')
        user_id = request.args.get('user', '')
        user = self.db.User.fetch(user_id)

        if not user:
            resp.update({ 'error': 'User not found.' })
        elif key != user.get('password_recovery'):
            resp.update({ 'error': 'Incorrect key.' })
        else:
            resp.update({ 'user_id': user_id, 'name': user['name'], 'key': key })

        tdata.context.update(page_data=resp, route_args=args)
        return self.serve_page(tdata, 'pages/main.html')

    def deactivate(self, tdata, request, response, **args):
        if request.form.get('deactivate')=='':
            if not tdata.user.logged_in:
                return { 'error': 'need_login'}
            # log them out
            auth.handle_logout(self.db, tdata.user, request, response)
            # delete user data
            tdata.user.delete()
            # redirect to home
            return self.redirect(response, abs_url('/'))

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
            return self.serve_404(tdata)
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
        if not entity: return self.serve_404(tdata)

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
        if not entity: return self.serve_404(tdata)

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
        fullscreen = request.form.get('fullscreen')

        recipient_address = request.form.get('emails')
        if not request.form.get('message') or not recipient_address: 
            return self.serve_json(response, { 'error': 'Message and recipient are mandatory fields.'})
        if not user.logged_in:
            return self.serve_json(response, { 'error': 'need_login'})

        recipient = self.db.User.fetch(recipient_address, keyname='email')
        recipient = recipient or {'email': recipient_address}

        expr.increment({'analytics.email.count': 1})

        log_data = {'service': 'email', 'to': recipient_address, 'expr_id': expr.id}
        # bugbug
        # self.db.ActionLog.create(request.requester, 'share', data=log_data)

        mailer = mail.ShareExpr(self.jinja_env, db=self.db)
        mailer.send(expr, user, recipient, request.form.get('message'), 
            request.form.get('send_copy'), fullscreen=fullscreen)

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
        
        return self.serve_page(tdata, 'pages/streamified_login.html')

    def streamified_test(self, tdata, request, response, **args):
        return self.serve_page(tdata, 'pages/streamified_test.html')

    def request_invite(self, tdata, request, response, **args):
        form = {
            'name': ''
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
            ,'Reply-To' : ', '.join([ feedback_address, user_email ])
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
    def unsubscribe_form(self, tdata, request, response):
        email = self.db.MailLog.fetch(request.args.get('email_id'))
        response.context['email'] = email.get('email')
        response.context['initiator'] = self.db.User.fetch(email.get('initiator'))
        return self.serve_page(tdata, 'pages/unsubscribe.html')

    # TODO-hookup & test
    def unsubscribe(self, tdata, request, response, **args):
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

    def name_check(self, tdata, request, response, **args):
        user_available = False if self.db.User.named(request.args.get('name')) else True
        return self.serve_json(response, user_available)

    # TODO-hookup & test
    def confirm_email(self, tdata, request, response, **args):
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
        return self.serve_page(tdata, "pages/email_confirmation.html")

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

    #     return self.serve_page(tdata, 'pages/signup.html')

    def create(self, tdata, request, response, **args):
        """ Checks if the referral code matches one found in database.
            Decrements the referral count of the user who created the referral and checks if the count is > 0.
            Creates user record.
            Creates empty home expression, so user.thenewhive.com does not show 404.
            Creates media directory for user.
            emails thank you for registering to user
            Logs new user in.
            """

        assert 'agree' in request.form
        assert not request.form.get('phone') # check invisible field for spam

        args = dfilter(request.form, ['name', 'password', 'email',
            'fullname', 'gender', 'thumb', 'thumb_file_id'])
        args.update({
             'sites'    : [args['name'].lower() + '.' + config.server_name]
            ,'email'   : args.get('email').lower()
            #,'flags'    : { 'add_invites_on_save' : True }
        })
        if not args.get('fullname'): args['fullname'] = args['name']

        referral = self._check_referral(request)
        if (not referral and not self.flags.get('open_signup')):
            return self.serve_json(response, { 'error': 'referral' })
        if referral:
            referrer = self.db.User.fetch(referral['user'])
        else:
            if self.flags.get('open_signup'):
                referrer = self.db.User.site_user
            else:
                assert referrer, 'Referring user not found'
        args['referrer'] = referrer.id

        credential_id = request.form.get('credential_id')
        if credential_id:
            credentials = self.db.Temp.fetch(credential_id)
            request.requester.fb_client.credentials = credentials
            fb_profile = request.requester.fb_client.me()
            args.update({
                'oauth': {'facebook': credentials}
                ,'facebook' : fb_profile
            })
        if request.form.get('age'):
            args.update({'birth_year':
                datetime.now().year - int(request.form.get('age'))})

        try:
            user = self.db.User.create(args)
        except Exception, e:
            return self.serve_json(response, { 'error':
                'username exists or invalid username' })

        email_lists = map(lambda email_list: {
            'name': email_list.name
        }, mail.MetaMailer.unsubscribable('user'))
        subscribed = []
        for email_list in email_lists:
            subscribed.append(email_list['name'])
            email_list['subscribed'] = True
        update = {}
        update['email_subscriptions'] = subscribed
        user.update(**update)

        # TODO: offer suggested users to follow.
        # new user follows NewHive
        self.db.Star.create(user, self.db.User.site_user)
        # self._friends_to_listen(request, user)
        # self._friends_not_to_listen(request, user)

        if user.get('referrer') != self.db.User.site_user.id:
            self.db.FriendJoined.create(user, referrer)
            # new user follows referrer
            self.db.Star.create(user, referrer)
            
        if referral:
            if referral.get('reuse'):
                referral.increment({'reuse': -1})
                referral.update_cmd({'$push': {'users_created': user.id}})
                if referral['reuse'] <= 0: referral.update(used=True)
            else:
                referral.update(
                    used=True,
                    user_created=user.id,
                    user_created_name=user['name'],
                    user_created_date=user['created']
                )
                contact = self.db.Contact.find({'referral_id': referral.id})
                if contact: contact.update(user_created=user.id)

        #user.give_invites(config.initial_invite_count)
        if args.has_key('thumb_file_id'):
            file = self.db.File.fetch(args.get('thumb_file_id'))
            if file:
                file.update(owner=user.id)

        try: mail.Welcome(db = self.db, jinja_env=self.jinja_env).send(user)
        except: 
            # log_error(db, request=request, message="unable to welcome send email for {}".format(user.get('email')))
            pass

        request.form = dict(username = args['name'], secret = args['password'])
        self.login(tdata, request, response)
        return self.redirect(response, '/' + user['name'] + '/profile')

    def _check_referral(self, request):
        # Get either key of a Referral object in our db, or a facebook id
        key = request.form.get('key')
        return self.db.Referral.find({'key': key})

    # Client registers session notification key to be used by notifications server
    def notify_register(self, tdata, request, response, **args):
        resp = {}
        # TODO: implement other services
        gcm_reg_id = request.args.get('gcm_reg_id')
        iphone_reg_id = request.args.get('iphone_reg_id')
        username = request.args.get('user')

        user = self.db.User.named(username)
        if user and (gcm_reg_id or iphone_reg_id):
            spec = user.profile_spec()
            search = self.db.Searches.get(spec)
            if gcm_reg_id:
                search.add_action(
                    {'type': 'gcm_notify', 'reg_id': gcm_reg_id})
            if iphone_reg_id:
                search.add_action(
                    {'type': 'iphone_notify', 'reg_id': iphone_reg_id})

        return self.serve_json(response, resp)

