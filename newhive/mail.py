import crypt, urllib, time
import newhive.state
from newhive.state import abs_url
from newhive import config
from cStringIO import StringIO
from smtplib import SMTP
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
from email.generator import Generator
from email import Charset
from werkzeug import url_unquote

import logging
logger = logging.getLogger(__name__)

Charset.add_charset('utf-8', Charset.QP, Charset.QP, 'utf-8')
def send_mail(headers, body):
    t0 = time.time()
    smtp = SMTP(config.email_server, config.email_port)
    logger.debug('SMTP connection time %d ms', (time.time() - t0) * 1000)
    msg = MIMEMultipart('alternative')
    msg['Subject'] = Header(headers['Subject'].encode('utf-8'), 'UTF-8').encode()
    msg['To'] = headers['To']
    msg['From'] = headers.get('From', 'The New Hive <noreply@thenewhive.com>')

    if type(body) == dict:
        plain = MIMEText(body['plain'].encode('utf-8'), 'plain')
        html = MIMEText(body['html'].encode('utf-8'), 'html')
        msg.attach(plain); msg.attach(html)
    else:
        part1 = MIMEText(body.encode('utf-8'), 'plain')
        msg.attach(part1)

    if config.email_user and config.email_password:
        smtp.login(config.email_user, config.email_password)

    # Unicode support is super wonky.  see http://radix.twistedmatrix.com/2010/07/how-to-send-good-unicode-email-with.html
    io = StringIO()
    g = Generator(io, False) # second argument means "should I mangle From?"
    g.flatten(msg)
    encoded_msg = io.getvalue()

    if config.debug_mode and not msg['To'] in config.admin_emails:
        logger.warn("Not sending mail to %s in debug mode" % (msg['To']))
    else:
        t0 = time.time()
        sent = smtp.sendmail(msg['From'], msg['To'].split(','), encoded_msg)
        logger.debug('SMTP sendmail time %d ms', (time.time() - t0) * 1000)
        return sent


def mail_invite(jinja_env, db, email, name=False, force_resend=False):
    if db.Referral.find(email, keyname='to') and not force_resend:
        return False

    user = db.User.named(config.site_user)
    referral = user.new_referral({'name': name, 'to': email})

    heads = {
        'To': email
        ,'Subject' : "You have a beta invitation to thenewhive.com"
        }

    context = {
        'name': name
        ,'url': referral.url
        }
    body = {
         'plain': jinja_env.get_template("emails/invitation.txt").render(context)
        ,'html': jinja_env.get_template("emails/invitation.html").render(context)
        }
    send_mail(heads, body)
    return referral.id

def mail_email_confirmation(jinja_env, user, email):
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
    send_mail(heads, body)

def mail_temporary_password(jinja_env, user, recovery_link):
    heads = {
        'To' : user.get('email')
        , 'Subject' : 'Password recovery for thenewhive.com'
        }
    context = {
        'recovery_link': recovery_link
        ,'user_fullname' : user['fullname']
        ,'user_name': user['name']
        }
    body = {
        'plain': jinja_env.get_template("emails/password_recovery.txt").render(context)
        ,'html': jinja_env.get_template("emails/password_recovery.html").render(context)
        }
    send_mail(heads, body)

def mail_feed(jinja_env, feed, recipient, dry_run=False):
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
    if type(feed) == newhive.state.Comment:
        context['message'] = feed.get('text')
        heads['Subject'] = initiator_name + ' commented on "' + expression_title + '"'
        context['url'] = context['url'] + "?loadDialog=comments"
    elif type(feed) == newhive.state.Star:
        if feed['entity_class'] == "Expr":
            heads['Subject'] = initiator_name + ' loves "' + expression_title + '"'
        elif feed['entity_class'] == "User":
            context['title'] = feed.initiator.get('fullname')
            context['url'] = feed.initiator.url
            context['thumbnail_url'] = feed.initiator.thumb
            heads['Subject'] = initiator_name + " is now listening to you"
    elif type(feed) == newhive.state.Broadcast:
        heads['Subject'] = initiator_name + ' broadcast "' + expression_title + '"'
    body = {
        'plain': jinja_env.get_template("emails/feed.txt").render(context)
        , 'html': jinja_env.get_template("emails/feed.html").render(context)
        }
    if dry_run:
        return heads
    elif recipient_name in config.admins or ( not config.debug_mode ):
        send_mail(heads, body)
        return heads

def mail_user_register_thankyou(jinja_env, user):
    user_profile_url = user.url
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
    send_mail(heads, body)
