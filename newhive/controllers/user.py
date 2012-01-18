from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController

class UserController(ApplicationController):

    def new(self, request, response):
        response.context['action'] = 'create'
        referral = self.db.Referral.fetch(request.args.get('key'), keyname='key')
        if not referral or referral.get('used'): return bad_referral(request, response)
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

        referral = self.db.Referral.fetch(request.args.get('key'), keyname='key')
        if (not referral or referral.get('used')): return bad_referral(request, response)
        referrer = self.db.User.fetch(referral['user'])
        assert 'tos' in request.form

        args = dfilter(request.form, ['name', 'password', 'email', 'fullname'])
        args.update({
             'referrer' : referral['user']
            ,'sites'    : [args['name'].lower() + '.' + config.server_name]
            #,'flags'    : { 'add_invites_on_save' : True }
        })
        user = self.db.User.create(**args)
        referrer.update(referrals = referrer['referrals'] - 1)
        referral.update(used=True, user_created=user.id, user_created_name=user['name'], user_created_date=user['created'])
        home_expr = user.expr_create({ 'title' : 'Homepage', 'home' : True })
        user.give_invites(5)

        try: mail_user_register_thankyou(user)
        except: pass # TODO: log an error

        request.form = dict(username = args['name'], secret = args['password'])
        login(request, response)
        return self.redirect(response, abs_url(subdomain=config.site_user) + config.site_pages['welcome'])

    def update(self, request, response):
        message = ''
        user = request.requester
        if not user.cmp_password(request.form.get('old_password')): return serve_json(response, {'success': False, 'message': ui.password_change_failure_message})
        if request.form.get('password'):
            if auth.password_change(request, response):
                message = message + ui.password_change_success_message + " "
            else:
                return serve_json(response, {'success': False, 'message': ui.password_change_failure_message})
        fullname = request.form.get('fullname')
        if fullname and fullname != request.requester.get('fullname'):
            user.update(fullname=fullname)
            message = message + ui.fullname_change_success_message + " "
        email = request.form.get('email')
        if email and email != request.requester.get('email'):
            user.update(email_confirmation_request_date=time.time())
            newhive.mail.mail_email_confirmation(self.jinja_env, user, email)
            message = message + ui.email_change_success_message + " "
        return self.serve_json(response, {'success': True, 'message': message})

    def profile_thumb_set(self, request, response):
        request.max_content_length = 10000000 # 10 megs
        file = request.files.get('profile_thumb')
        mime = mimetypes.guess_type(file.filename)[0]
        if not mime in ['image/jpeg', 'image/png', 'image/gif']:
            response.context['error'] = "File must be either JPEG, PNG or GIF and be less than 10 MB"

        tmp_file = os.tmpfile()
        file.save(tmp_file)
        res = self.db.File.create(owner=request.requester.id, tmp_file=tmp_file, name=file.filename, mime=mime)
        tmp_file.close()
        request.requester.update(thumb_file_id = res.id, profile_thumb=res.get_thumb(190,190))
        return self.redirect(response, request.form['forward'])

    def password_recovery(self, request, response):
        email = request.form.get('email')
        name = request.form.get('name')
        user = self.db.User.find(email=email, name=name)
        if user:
            password = junkstr(8)
            newhive.mail.mail_temporary_password(jinja_env, user, password)
            user.set_password(password)
            user.save()
            return serve_json(response, {'success': True, 'message': ui.password_recovery_success_message})
        else:
            return serve_json(response, {'success': False, 'message': ui.password_recovery_failure_message})


