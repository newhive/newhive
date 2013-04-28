from newhive.controllers.shared import *
from newhive.controllers import Application
from werkzeug import url_unquote
from werkzeug.urls import url_decode
from newhive.mail import send_mail
from newhive import utils, mail


class Mail(Application):

    def signup_request(self, request, response):
        if not request.form.get('email'): return False
        form = {
            'name': request.form.get('name')
            ,'email': request.form.get('email').lower()
            ,'referral': request.form.get('referral')
            ,'message': request.form.get('message')
            ,'url': request.form.get('forward')
            }

        try: # this step is really not neccessary, so ignore errors
            args = form['url'].split('?')
            if len(args) > 1:
                args = url_decode(args[1])
            if hasattr(args, 'has_key') and args.has_key('code'):
                request.requester.fb_client.exchange(code=args['code'], redirect_uri=form['url'])
                form.update({'facebook': request.requester.fb_client.me()})
        except Exception as e:
            print e
            pass

        heads = {
             'To' : 'info@thenewhive.com'
            ,'From' : 'www-data@' + config.server_name
            ,'Subject' : '[home page contact form]'
            ,'Reply-to' : form['email']
            }
        body = "Email: %(email)s\n\nName: %(name)s\n\nHow did you hear about us?\n%(referral)s\n\nHow do you express yourself?\n%(message)s" % form
        form.update({'msg': body})
        if not config.debug_mode:
            send_mail(heads, body)
        contact = self.db.Contact.create(form)
        sendgrid_args = {'contact_id': contact.id, 'url': form['url']}

        if config.auto_invite:
            mailer = mail.SiteReferral(db=self.db, jinja_env=self.jinja_env)
            referral_id = mailer.send(form.get('email'), form.get('name'))
            if referral_id:
                contact.update(referral_id=referral_id)
        else:
            mailer = mail.SignupRequest(db=self.db, jinja_env=self.jinja_env)
            mailer.send(form.get('email'), form.get('name'), sendgrid_args)

        return self.serve_page(response, 'dialogs/signup_thank_you.html')

    def share_expr(self, request, response):
        recipient_address = request.form.get('to')
        if not request.form.get('message') or not recipient_address: return False

        recipient = self.db.User.fetch(recipient_address, keyname='email')
        recipient = recipient or {'email': recipient_address}
        expr = self.db.Expr.named(*request.path.split('/', 1))

        expr.increment({'analytics.email.count': 1})

        log_data = {'service': 'email', 'to': recipient_address, 'expr_id': expr.id}
        self.db.ActionLog.create(request.requester, 'share', data=log_data)

        mailer = mail.ShareExpr(self.jinja_env, db=self.db)
        mailer.send(expr, request.requester, recipient, request.form.get('message'), request.form.get('send_copy'))

        return self.serve_json(response, True)

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