import crypt, urllib, time, json, re
import newhive.state
from newhive.state import abs_url
from newhive import config, inliner, utils
import newhive.ui_strings.en as ui
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
def send_mail(headers, body, category=None, unique_args=None):
    def to_json(data):
        j = json.dumps(data)
        return re.compile('(["\]}])([,:])(["\[{])').sub('\1\2 \3', j)

    # smtp connection setup and timings
    t0 = time.time()
    smtp = SMTP(config.email_server, config.email_port)
    if config.email_user and config.email_password:
        smtp.login(config.email_user, config.email_password)
    logger.debug('SMTP connection time %d ms', (time.time() - t0) * 1000)

    # Message header assembly
    msg = MIMEMultipart('alternative')
    msg['Subject'] = Header(headers['Subject'].encode('utf-8'), 'UTF-8').encode()
    msg['To'] = headers['To']
    msg['From'] = headers.get('From', 'The New Hive <noreply@thenewhive.com>')

    # Sendgrid smtp api setup
    if category or unique_args:
        smtpapi = {}
        if category:    smtpapi.update({'category': category})
        if unique_args: smtpapi.update({'unique_args': unique_args})
        msg['X-SMTPAPI'] = to_json(smtpapi)

    # Message body assembly
    if type(body) == dict:
        plain = MIMEText(body['plain'].encode('utf-8'), 'plain')
        html = MIMEText(body['html'].encode('utf-8'), 'html')
        msg.attach(plain); msg.attach(html)
    else:
        part1 = MIMEText(body.encode('utf-8'), 'plain')
        msg.attach(part1)

    # Unicode support is super wonky.  see
    # http://radix.twistedmatrix.com/2010/07/how-to-send-good-unicode-email-with.html
    io = StringIO()
    g = Generator(io, False) # second argument means "should I mangle From?"
    g.flatten(msg)
    encoded_msg = io.getvalue()

    # write e-mail to file for debugging
    if config.debug_mode:
        path = '/lib/tmp/' + utils.junkstr(10) + '.html'
        with open(config.src_home + path, 'w') as f:
            f.write(body['html'])
        logger.debug('temporary e-mail path: ' + abs_url(secure=True) + path)

    # Send mail, but if we're in debug mode only send to admins
    if config.live_server or msg['To'] in config.admin_emails:
        t0 = time.time()
        sent = smtp.sendmail(msg['From'], msg['To'].split(','), encoded_msg)
        logger.debug('SMTP sendmail time %d ms', (time.time() - t0) * 1000)
        return sent
    else:
        logger.warn("Not sending mail to %s in debug mode" % (msg['To']))


def site_referral(jinja_env, db, email, name=False, force_resend=False):
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
    send_mail(heads, body, 'site_referral')
    return referral.id

def email_confirmation(jinja_env, user, email):
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
    send_mail(heads, body, 'email_confirmation')

def temporary_password(jinja_env, user, recovery_link):
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
    send_mail(heads, body, 'temporary_password')

def mail_feed(jinja_env, feed, dry_run=False):

    subject = None
    if type(feed) == newhive.state.Comment:
        message = feed.get('text')
        header_message = ['commented on', 'your expression']
    elif type(feed) == newhive.state.Star:
        if feed['entity_class'] == "Expr":
            header_message = ['loves', 'your expression']
            message = "Now they can keep track of your expression and be notified of updates and discussions."
            subject = feed.initiator.get('name') + ' loves "' + feed.entity.get('title') + '"'
        elif feed['entity_class'] == "User":
            header_message = ['is now', 'listening to you']
            message = "Now they will receive updates about what you're creating and broadcasting."
    elif type(feed) == newhive.state.Broadcast:
        message = "Your expression has been broadcast to their network of listeners."
        header_message = ['broadcast', 'your expression']
        subject = feed.initiator.get('name') + ' broadcast "' + feed.entity.get('title') + '"'

    mail_expr_action(
            jinja_env = jinja_env
            , category = 'mail_feed'
            , initiator = feed.initiator
            , recipient = feed.entity.owner
            , expr = feed.entity
            , message = message
            , header_message = header_message
            , subject = subject
            )

def user_register_thankyou(jinja_env, user):
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
    send_mail(heads, body, 'user_register_thankyou')


def mail_expr_action(jinja_env, category, initiator, recipient, expr, message, header_message, subject=None):

        context = {
            'message': message
            ,'initiator': initiator
            ,'recipient': recipient
            , 'header': header_message
            , 'expr': expr
            , 'server_url': abs_url()
            }

        heads = {
             'To' : recipient.get('email')
            ,'Subject' : subject or initiator.get('name') + ' ' + ' '.join(header_message)
            ,'Reply-to' : initiator.get('email', '')
            }

        html = jinja_env.get_template("emails/expr_action.html").render(context)
        html = inliner.inline_styles(html, css_path=config.src_home + "/libsrc/email.css")

        body = {
             'plain': jinja_env.get_template("emails/share.txt").render(context)
            ,'html': html
            }
        sendgrid_args = {'initiator': initiator.get('name'), 'expr_id': expr.id}
        send_mail(heads, body, category=category, unique_args=sendgrid_args)

        # if request.form.get('send_copy'):
        #     heads.update(To = request.requester.get('email', ''))
        #     send_mail(heads, body)

def milestone(jinja_env, expr, milestone):
    context = {
        'message': ui.milestone_message
        , 'expr': expr
        , 'milestone': milestone
        , 'server_url': abs_url()
        }

    heads = {
        'To': expr.owner.get('email')
        , 'Subject': 'Your expression "{}" has {} views'.format(expr['title'], milestone)
        }

    html = jinja_env.get_template("emails/milestone.html").render(context)
    html = inliner.inline_styles(html, css_path=config.src_home + "/libsrc/email.css")

    body = {
         'plain': jinja_env.get_template("emails/share.txt").render(context)
        ,'html': html
        }
    sendgrid_args = {'expr_id': expr.id, 'milestone': milestone}
    send_mail(heads, body, category='milestone', unique_args=sendgrid_args)

