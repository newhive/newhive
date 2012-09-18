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

    # Send mail, but if we're in debug mode only send to admins
    if config.live_server or msg['To'] in config.admin_emails:
        t0 = time.time()
        sent = smtp.sendmail(msg['From'], msg['To'].split(','), encoded_msg)
        logger.debug('SMTP sendmail time %d ms', (time.time() - t0) * 1000)
        return sent
    else:
        logger.warn("Not sending mail to %s in debug mode" % (msg['To']))


class Mailer(object):
    recipient = None
    unsubscribable = True

    def __init__(self, jinja_env=None, db=None):
        self.db = db
        self.jinja_env = jinja_env

    def send_mail(self, heads, body, **kwargs):

        heads.update(To=self.recipient.get('email'))
        if hasattr(self, 'name'):
            kwargs.update(category=self.name)

        # check subscription status
        if isinstance(self.recipient, newhive.state.User):
            subscriptions = self.recipient.get('email_subscriptions', [])
            unsubscribed = self.unsubscribable and not self.name in subscriptions
        else:
            unsubscribed = self.db.Unsubscribes.find({
                'email': self.recipient['email']
                , 'name': {'$in': ['all', self.name]}
                })
        logger.info("to: {}\tname: {}\tstatus: {}".format(
            self.recipient.get('email')
            , self.name
            , 'unsubscribed' if unsubscribed else 'sent'
            ))

        # write e-mail to file for debugging
        if config.debug_mode:
            path = '/lib/tmp/' + utils.junkstr(10) + '.html'
            with open(config.src_home + path, 'w') as f:
                f.write(body['html'])
            logger.debug('temporary e-mail path: ' + abs_url(secure=True) + path)

        if not unsubscribed:
            send_mail(heads, body, **kwargs)

class SiteReferral(Mailer):
    name = 'site_referral'
    sent_to = ['nonusers']
    unsubscribable = True

    def send(self, email, name=False, force_resend=False):
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
        self.send_mail(heads, body)
        return referral.id

class EmailConfirmation(Mailer):
    name = 'email_confirmation'
    unsubscribable = False

    def send(user, email):
        self.recipient = user
        secret = crypt.crypt(email, "$6$" + str(int(user.get('email_confirmation_request_date'))))
        link = abs_url(secure=True) +\
                "email_confirmation?user=" + user.id +\
                "&email=" + urllib.quote(email) +\
                "&secret=" + urllib.quote(secret)
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
            'plain': self.jinja_env.get_template("emails/email_confirmation.txt").render(context)
            ,'html': self.jinja_env.get_template("emails/email_confirmation.html").render(context)
            }
        self.send_mail(heads, body)

class TemporaryPassword(Mailer):
    name = 'temporary_password'
    unsubscribable = False

    def send(user, recovery_link):
        self.recipient = user
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
            'plain': self.jinja_env.get_template("emails/password_recovery.txt").render(context)
            ,'html': self.jinja_env.get_template("emails/password_recovery.html").render(context)
            }
        self.send_mail(heads, body)

class ExprAction(Mailer):

    @property
    def recipient(self): return self.feed.entity.owner
    @property
    def initiator(self): return self.feed.initiator
    subject = None

    def send(self):
        context = {
            'message': self.message
            ,'initiator': self.initiator
            ,'recipient': self.recipient
            , 'header': self.header_message
            , 'expr': self.card
            , 'server_url': abs_url()
            }

        heads = {
             'To' : self.recipient.get('email')
            ,'Subject' : self.subject or self.initiator.get('name') + ' ' + ' '.join(self.header_message)
            ,'Reply-to' : self.initiator.get('email', '')
            }

        html = self.jinja_env.get_template("emails/expr_action.html").render(context)
        html = inliner.inline_styles(html, css_path=config.src_home + "/libsrc/email.css")

        body = {
             'plain': self.jinja_env.get_template("emails/share.txt").render(context)
            ,'html': html
            }
        sendgrid_args = {'initiator': self.initiator.get('name'), 'expr_id': self.card.id}
        self.send_mail(heads, body, unique_args=sendgrid_args)

class Comment(ExprAction):
    name = 'comment'
    @property
    def message(self): return self.feed.get('text')

    header_message = ['commented on', 'your expression']

    @property
    def card(self): return self.feed.entity

class UserStar(ExprAction):
    name = 'listen'
    message = "Now they will receive updates about what you're creating and broadcasting."
    header_message = ['is now', 'listening to you']
    @property
    def card(self): return self.feed.initiator

class ExprStar(ExprAction):
    name = 'love'
    message = "Now they can keep track of your expression and be notified of updates and discussions."
    header_message = ['loves', 'your expression']
    @property
    def subject(self):
        return self.feed.initiator.get('name') + ' loves "' + self.feed.entity.get('title') + '"'

    @property
    def card(self): return self.feed.entity

class Broadcast(ExprAction):
    name = 'broadcast'
    message = "Your expression has been broadcast to their network of listeners."
    header_message = ['broadcast', 'your expression']

    @property
    def subject(self):
        return self.feed.initiator.get('name') + ' broadcast "' + self.feed.entity.get('title') + '"'

    @property
    def card(self):
        return self.feed.entity

class Feed(Mailer):
    def send(self, feed):
        if type(feed) == newhive.state.Comment:
            mailer_class = Comment
        elif type(feed) == newhive.state.Star:
            if feed['entity_class'] == "Expr":
                mailer_class = ExprStar
            elif feed['entity_class'] == "User":
                mailer_class = UserStar
        elif type(feed) == newhive.state.Broadcast:
            mailer_class = Broadcast

        mailer = mailer_class(self.jinja_env, self.db)
        mailer.feed = feed
        mailer.send()

class UserRegisterConfirmation(Mailer):
    name = 'user_register_confirmation'
    unsubscribable = False

    def send(self, user):
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
             'plain': self.jinja_env.get_template("emails/thank_you_register.txt").render(context)
            ,'html': self.jinja_env.get_template("emails/thank_you_register.html").render(context)
            }
        self.send_mail(heads, body)

class ShareExpr(ExprAction):

    name = 'share_expr'
    header_message = ['has sent', 'you an expression']
    recipient = None
    initiator = None

    def send(self, expr, initiator, recipient, message):
        self.card = expr
        self.initiator = initiator
        self.recipient = recipient
        self.message = message
        super(ShareExpr, self).send()

class Milestone(Mailer):
    name = 'milestone'

    def send(self, expr, milestone):
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

        html = self.jinja_env.get_template("emails/milestone.html").render(context)
        html = inliner.inline_styles(html, css_path=config.src_home + "/libsrc/email.css")

        body = {
             'plain': self.jinja_env.get_template("emails/share.txt").render(context)
            ,'html': html
            }
        sendgrid_args = {'expr_id': expr.id, 'milestone': milestone}
        self.send_mail(heads, body, unique_args=sendgrid_args)
