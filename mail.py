from smtplib import SMTP
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from state import Expr
import config

def send_mail(headers, body):
    msg = MIMEMultipart('alternative')
    for k in ['Subject', 'From', 'To']:
      msg[k] = headers[k]

    if type(body) == dict:
        plain = MIMEText(body['plain'], 'plain')
        html = MIMEText(body['html'], 'html')
        msg.attach(plain); msg.attach(html)
    else:
        part1 = MIMEText(body, 'plain')
        msg.attach(part1)

    smtp = SMTP(config.email_server)
    if config.email_user and config.email_password:
      smtp.login(config.email_user, config.email_password)

    return smtp.sendmail(msg['From'], msg['To'].split(','), msg.as_string())

def mail_us(request, response):
    if not request.form.get('email'): return False
    form = {
        'name': request.form.get('name')
        ,'email': request.form.get('email')
        ,'referral': request.form.get('referral')
        ,'message': request.form.get('message')
        }
    heads = {
         'To' : 'info@thenewhive.com'
        ,'From' : 'www-data@' + config.server_name
        ,'Subject' : '[home page contact form]'
        ,'Reply-to' : form['email']
        }
    body = "Email: %(email)s\n\nName: %(name)s\n\nHow did you hear about us?\n%(referral)s\n\nHow do you express yourself?\n%(message)s" % form
    print(request.form)
    print(form)
    form.update({'msg': body})
    if not config.debug_mode:
        send_mail(heads, body)
    Contact.create(**form)

    return jinja_env.get_template('dialogs/signup_thank_you.html').render(response.context)

def mail_them(request, response):
    from wsgi import redirect, jinja_env, exceptions
    if not request.trusting: raise exceptions.BadRequest()
    if not request.form.get('message') or not request.form.get('to'): return False
    exp = Expr.fetch(request.form.get('id'))
    exp.increment({'analytics.email.count': 1})

    heads = {
         'To' : request.form.get('to')
        ,'From' : 'The New Hive <noreply+share@thenewhive.com>'
        ,'Subject' : request.form.get('subject', '')
        ,'Reply-to' : request.requester.get('email', '')
        }
    context = {
         'message': request.form.get('message')
        ,'url': request.form.get('forward')
        ,'title': exp.get('title')
        }
    body = {
         'plain': jinja_env.get_template("emails/share.txt").render(context)
        ,'html': jinja_env.get_template("emails/share.html").render(context)
        }
    send_mail(heads, body)
    if request.form.get('send_copy'):
        heads.update(To = request.requester.get('email', ''))
        send_mail(heads, body)
    return redirect(response, request.form.get('forward'))

def mail_feedback(request, response):
    if not request.form.get('message'): return serve_error(response, 'Sorry, there was a problem sending your message.')
    heads = {
         'To' : 'bugs@thenewhive.com'
        ,'From' : 'Feedback <noreply+feedback@' + config.server_name +'>'
        ,'Subject' : 'Feedback from ' + request.requester.get('name', '') + ', ' + request.requester.get('fullname', '')
        ,'Reply-to' : request.requester.get('email', '')
        }
    url = url_unquote(request.form.get('url', ''))
    body = (
        request.form.get('message')
        + "\n\n----------------------------------------\n\n"
        + url + "\n"
        + 'User-Agent: ' + request.headers.get('User-Agent', default='')
        + 'From: ' + request.requester.get('email', '')
        )
    send_mail(heads, body)
    if request.form.get('send_copy'):
        heads.update(To = request.requester.get('email', ''))
        send_mail(heads, body)
    response.context['success'] = True


