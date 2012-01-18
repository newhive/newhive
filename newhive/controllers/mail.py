from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from cStringIO import StringIO
from smtplib import SMTP
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
from email.generator import Generator
from email import Charset
from werkzeug import url_unquote


class MailController(ApplicationController):

    Charset.add_charset('utf-8', Charset.QP, Charset.QP, 'utf-8')
    def send_mail(self, headers, body):
        msg = MIMEMultipart('alternative')
        msg['Subject'] = Header(headers['Subject'].encode('utf-8'), 'UTF-8').encode()
        msg['To'] = headers['To']
        msg['From'] = headers.get('From', 'The New Hive <noreply@thenewhive.com>')

        if type(body) == dict:
            plain = MIMEText(body['plain'].encode('utf-8'), 'plain')
            html = MIMEText(body['html'].encode('utf-8'), 'html')
            msg.attach(plain); msg.attach(html)
        else:
            part1 = MIMEText(body, 'plain')
            msg.attach(part1)

        smtp = SMTP(config.email_server)
        if config.email_user and config.email_password:
            smtp.login(config.email_user, config.email_password)

        # Unicode support is super wonky.  see http://radix.twistedmatrix.com/2010/07/how-to-send-good-unicode-email-with.html
        io = StringIO()
        g = Generator(io, False) # second argument means "should I mangle From?"
        g.flatten(msg)
        encoded_msg = io.getvalue()

        return smtp.sendmail(msg['From'], msg['To'].split(','), encoded_msg)

    def mail_us(self, request, response):
        if not request.form.get('email'): return False
        form = {
            'name': request.form.get('name')
            ,'email': request.form.get('email')
            ,'referral': request.form.get('referral')
            ,'message': request.form.get('message')
            ,'url': request.form.get('forward')
            }
        heads = {
             'To' : 'info@thenewhive.com'
            ,'From' : 'www-data@' + config.server_name
            ,'Subject' : '[home page contact form]'
            ,'Reply-to' : form['email']
            }
        body = "Email: %(email)s\n\nName: %(name)s\n\nHow did you hear about us?\n%(referral)s\n\nHow do you express yourself?\n%(message)s" % form
        form.update({'msg': body})
        if not config.debug_mode:
            self.send_mail(heads, body)
        self.db.Contact.create(**form)

        mail_signup_thank_you(form)

        return serve_page(response, 'dialogs/signup_thank_you.html')

    def mail_them(self, request, response):
        if not request.form.get('message') or not request.form.get('to'): return False

        log_data = {'service': 'email', 'to': request.form.get('to')}

        response.context.update({
             'message': request.form.get('message')
            ,'url': request.form.get('forward')
            ,'title': request.form.get('forward')
            ,'sender_fullname': request.requester.get('fullname')
            ,'sender_url': home_url(request.requester)
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
              ,'user_url': home_url(owner)
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
             'plain': render_template(response, "emails/share.txt")
            ,'html': render_template(response, "emails/share.html")
            }
        self.send_mail(heads, body)
        self.db.ActionLog.new(request.requester, 'share', data=log_data)
        if request.form.get('send_copy'):
            heads.update(To = request.requester.get('email', ''))
            self.send_mail(heads, body)
        return redirect(response, request.form.get('forward'))

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
                 'referrer_url': home_url(user)
                ,'referrer_name': user.get('fullname')
                ,'url': (abs_url(secure=True) + 'signup?key=' + referral['key'] + '&email=' + to_email)
                ,'name': name
                }
            body = {
                 'plain': jinja_env.get_template("emails/user_invitation.txt").render(context)
                ,'html': jinja_env.get_template("emails/user_invitation.html").render(context)
                }
            self.send_mail(heads, body)
        return redirect(response, request.form.get('forward'))

    def mail_invite(self, email, name=False, force_resend=False):
        user = get_root()

        if self.db.Referral.find(to=email) and not force_resend:
            return False

        referral = user.new_referral({'name': name, 'to': email})

        heads = {
            'To': email
            ,'Subject' : "You have a beta invitation to thenewhive.com"
            }

        context = {
            'name': name
            ,'url': (abs_url(secure=True) + 'signup?key=' + referral['key'] + '&email=' + email)
            }
        body = {
             'plain': jinja_env.get_template("emails/invitation.txt").render(context)
            ,'html': jinja_env.get_template("emails/invitation.html").render(context)
            }
        self.send_mail(heads, body)
        return referral.id

    def mail_feed(self, feed, recipient, dry_run=False):
      initiator_name = feed.get('initiator_name')
      recipient_name = recipient.get('name')
      expression_title = feed.entity.get('title')
      context = {
          'user_name' : recipient_name
          , 'user_url' : recipient.url
          , 'initiator_name': initiator_name
          , 'initiator_url': feed.initiator.url
          , 'url': feed.entity.url
          , 'thumbnail_url': feed.entity.thumb
          , 'title': expression_title
          , 'type': feed['class_name']
          , 'entity_type': feed['entity_class']
          }
      heads = {
          'To': recipient.get('email')
          }
      if type(feed) == Comment:
          context['message'] = feed.get('text')
          heads['Subject'] = initiator_name + ' commented on "' + expression_title + '"'
          context['url'] = context['url'] + "?loadDialog=comments"
      elif type(feed) == Star:
          if feed['entity_class'] == "Expr":
              heads['Subject'] = initiator_name + ' starred "' + expression_title + '"'
          elif feed['entity_class'] == "User":
              context['title'] = feed.initiator.get('fullname')
              context['url'] = feed.initiator.url
              context['thumbnail_url'] = feed.initiator.thumb
              heads['Subject'] = initiator_name + " is now listening to you"
      body = {
          'plain': jinja_env.get_template("emails/feed.txt").render(context)
          , 'html': jinja_env.get_template("emails/feed.html").render(context)
          }
      if dry_run:
          return heads
      elif recipient_name in config.admins or ( not config.debug_mode ):
          self.send_mail(heads, body)
          return heads

    def mail_signup_thank_you(self, form):
        context = {
            'url': 'http://thenewhive.com'
            ,'thumbnail_url': 'http://thenewhive.com/lib/skin/1/thumb_0.png'
            ,'name': form.get('name')
            }
        heads = {
            'To': form.get('email')
            ,'Subject': 'Thank you for signing up for a beta account on The New Hive'
            }
        body = {
             'plain': jinja_env.get_template("emails/thank_you_signup.txt").render(context)
            ,'html': jinja_env.get_template("emails/thank_you_signup.html").render(context)
            }
        self.send_mail(heads,body)


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
        print self.send_mail(heads, body)
        if request.form.get('send_copy'):
            heads.update(To = request.requester.get('email', ''))
            self.send_mail(heads, body)
        response.context['success'] = True

    def mail_user_register_thankyou(self, user):
        user_profile_url = home_url(user)
        user_home_url = re.sub(r'/[^/]*$', '', user_profile_url)
        heads = {
            'To' : user['email']
            , 'Subject' : 'Thank you for creating an account on thenewhive.com'
            }
        context = {
            'user_fullname' : user['fullname']
            , 'user_home_url' : user_home_url
            , 'user_home_url_display' : re.sub(r'^https?://', '', user_home_url)
            , 'user_profile_url' : user_profile_url
            , 'user_profile_url_display' : re.sub(r'^https?://', '', user_profile_url)
            }
        body = {
             'plain': jinja_env.get_template("emails/thank_you_register.txt").render(context)
            ,'html': jinja_env.get_template("emails/thank_you_register.html").render(context)
            }
        self.send_mail(heads, body)


    def mail_email_confirmation(self, user, email):
        secret = crypt.crypt(email, "$6$" + str(int(user.get('email_confirmation_request_date'))))
        link = abs_url(secure=True) + "email_confirmation?user=" + user.id + "&email=" + urllib.quote(email) + "&secret=" + urllib.quote(secret)
        heads = {
            'To' : email
            , 'Subject' : 'Confirm change of e-mail address for thenewhive.com'
            }
        context = {
            'user_fullname' : user['fullname']
            ,'user_name': user['name']
            ,'link' : link
            }
        body = {
            'plain': jinja_env.get_template("emails/email_confirmation.txt").render(context)
            ,'html': jinja_env.get_template("emails/email_confirmation.html").render(context)
            }
        self.send_mail(heads, body)

    def mail_temporary_password(self, user):
        password = junkstr(8)
        heads = {
            'To' : user.get('email')
            , 'Subject' : 'Password recovery for thenewhive.com'
            }
        context = {
            'password': password
            ,'user_fullname' : user['fullname']
            ,'user_name': user['name']
            }
        body = {
            'plain': jinja_env.get_template("emails/password_recovery.txt").render(context)
            ,'html': jinja_env.get_template("emails/password_recovery.html").render(context)
            }
        self.send_mail(heads, body)
        user.set_password(password)
        user.save()
