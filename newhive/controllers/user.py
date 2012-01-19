from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from newhive.utils import normalize

class UserController(ApplicationController):

    def index(self, request, response, args={}):
        page = int(request.args.get('page', 0))
        owner = response.context['owner']
        is_owner = request.requester.logged_in and owner.id == request.requester.id
        tags = owner.get('tags', [])
        expressions_tag = {'url': '/expressions', 'name': 'Expressions', 'show_name': False}
        people_tag = {'url': '/people', 'name': 'People'}
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
        else:
            pass

    def new(self, request, response):
        response.context['action'] = 'create'
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

        referral = self.db.Referral.fetch(request.args.get('key'), keyname='key')
        if (not referral or referral.get('used')): return self._bad_referral(request, response)
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

    def edit(self, request, response):
        if request.requester.logged_in and request.is_secure:
            response.context['action'] = 'update'
            response.context['f'] = request.requester
            return self.serve_page(response, 'pages/user_settings.html')

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
            newhive.mail.mail_email_confirmation(self.jinja_env, user, email)
            message = message + ui.email_change_success_message + " "
        return self.serve_json(response, {'success': True, 'message': message})

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
        if auth.handle_login(request, response):
            return self.redirect(response, request.form.get('url', request.requester.url))

    def logout(self, request, response):
        auth.handle_logout(request, response)


    def _bad_referral(self, request, response):
        response.context['msg'] = 'You have already signed up. If you think this is a mistake, please try signing up again, or contact us at <a href="mailto:info@thenewhive.com">info@thenewhive.com</a>'
        response.context['error'] = 'Log in if you already have an account'
        return self.serve_page(response, 'pages/error.html')


