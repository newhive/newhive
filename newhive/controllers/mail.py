from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from werkzeug import url_unquote
from werkzeug.urls import url_decode
from newhive.mail import send_mail, mail_signup_thank_you


class MailController(ApplicationController):

    def mail_us(self, request, response):
        if not request.form.get('email'): return False
        form = {
            'name': request.form.get('name')
            ,'email': request.form.get('email')
            ,'referral': request.form.get('referral')
            ,'message': request.form.get('message')
            ,'url': request.form.get('forward')
            }
        args = url_decode(form['url'].split('?')[1])
        if args.has_key('code'):
            try:
                request.requester.fb_client.exchange(code=args['code'], redirect_uri=form['url'])
                form.update({'facebook': request.requester.fb_client.me()})
            except Exception as e:
                print e
                pass # this step is really not neccessary, so ignore errors
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
        self.db.Contact.create(form)

        mail_signup_thank_you(self.jinja_env, form)

        return self.serve_page(response, 'dialogs/signup_thank_you.html')

    def mail_them(self, request, response):
        if not request.form.get('message') or not request.form.get('to'): return False

        log_data = {'service': 'email', 'to': request.form.get('to')}

        response.context.update({
             'message': request.form.get('message')
            ,'url': request.form.get('forward')
            ,'title': request.form.get('forward')
            ,'sender_fullname': request.requester.get('fullname')
            ,'sender_url': request.requester.url
            })

        exp = self.db.Expr.fetch(request.form.get('id'))

        if exp:
            exp.increment({'analytics.email.count': 1})
            owner = self.db.User.fetch(exp.get('owner'))
            log_data['expr_id'] = exp.id
            response.context.update({
              'short_url': (exp.get('domain') + '/' + exp.get('name'))
              ,'tags': exp.get('tags')
              ,'thumbnail_url': exp.get('thumb', abs_url() + '/lib/skin/1/thumb_0.png')
              ,'user_url': owner.url
              ,'user_name': owner.get('name')
              ,'title': exp.get('title')
              })
        else:
            log_data['url'] = request.form.get('forward')

        heads = {
             'To' : request.form.get('to')
            ,'Subject' : request.form.get('subject', '')
            ,'Reply-to' : request.requester.get('email', '')
            }

        body = {
             'plain': self.render_template(response, "emails/share.txt")
            ,'html': self.render_template(response, "emails/share.html")
            }
        send_mail(heads, body)
        self.db.ActionLog.create(request.requester, 'share', data=log_data)
        if request.form.get('send_copy'):
            heads.update(To = request.requester.get('email', ''))
            send_mail(heads, body)
        return self.redirect(response, request.form.get('forward'))

    def mail_referral(self, request, response):
        user = request.requester
        for i in range(0,4):
            name = request.form.get('name_' + str(i))
            to_email = request.form.get('to_' + str(i))
            if user['referrals'] <= 0 or not name or not to_email or len(name) == 0 or len(to_email) == 0: break
            referral = user.new_referral({'name': name, 'to': to_email})

            heads = {
                 'To' : to_email
                ,'Subject' : user.get('fullname') + ' has invited you to The New Hive'
                ,'Reply-to' : user.get('email', '')
                }
            context = {
                 'referrer_url': user.url
                ,'referrer_name': user.get('fullname')
                ,'url': (abs_url(secure=True) + 'signup?key=' + referral['key'] + '&email=' + to_email)
                ,'name': name
                }
            body = {
                 'plain': self.jinja_env.get_template("emails/user_invitation.txt").render(context)
                ,'html': self.jinja_env.get_template("emails/user_invitation.html").render(context)
                }
            send_mail(heads, body)
        return self.redirect(response, request.form.get('forward'))


    def mail_feedback(self, request, response):
        if not request.form.get('message'): return serve_error(response, 'Sorry, there was a problem sending your message.')
        heads = {
             'To' : 'bugs@thenewhive.com'
            ,'From' : 'Feedback <noreply+feedback@' + config.server_name +'>'
            ,'Subject' : 'Feedback from ' + request.requester.get('name', '') + ', ' + request.requester.get('fullname', '')
            ,'Reply-to' : request.requester.get('email', '')
            }
        url = url_unquote(request.args.get('url', ''))
        body = (
            request.form.get('message')
            + "\n\n----------------------------------------\n\n"
            + url + "\n"
            + 'User-Agent: ' + request.headers.get('User-Agent', '') + "\n"
            + 'From: ' + request.requester.get('email', '')
            )
        print send_mail(heads, body)
        if request.form.get('send_copy'):
            heads.update(To = request.requester.get('email', ''))
            send_mail(heads, body)
        response.context['success'] = True
