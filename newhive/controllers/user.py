import httplib2, urllib
from newhive import auth, config
from newhive.controllers.controller import ModelController
from newhive.mail import send_mail
from newhive.utils import log_error

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

    # TODO: implement, hook in app.py
    def comment_edit(self, tdata, request, response):
        return self.serve_json(response, False)
    def comment_delete(self, tdata, request, response):
        return self.serve_json(response, False)

    def comment_create(self, tdata, request, response):
        # Feed.comment(request, response)
        resp = False
        user = tdata.user
        expr = self.db.Expr.fetch(request.form.get('entity'))
        if not expr: return self.serve_404(tdata, request, response)
        text = request.form.get('text')
        if text.strip() == '': return False

        comment = self.db.Comment.create(user, expr, {'text': text})
        # TODO: mail settings
        # if user.id != expr.owner.id:
        #     mail.Feed(db=self.db, jinja_env=self.jinja_env).send(comment)
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
            request.form.get('fuckoff') # value in invisible field means spam
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