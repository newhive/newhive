import crypt, urllib, time, json, re, pymongo
import newhive.state
from newhive.state import abs_url
from newhive import config, utils
import newhive.ui_strings.en as ui
from cStringIO import StringIO
from smtplib import SMTP
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
from email.generator import Generator
from email import Charset
from jinja2 import TemplateNotFound
from werkzeug import url_unquote
import cssutils #sudo pip install cssutils
from lxml import etree #sudo apt-get install python-lxml
import lxml.html

import logging
logger = logging.getLogger(__name__)

send_real_email = True
css_debug = False

Charset.add_charset('utf-8', Charset.QP, Charset.QP, 'utf-8')

class EmailHtml(object):
    def __init__(self, html_string):
        self.html = lxml.html.fromstring(html_string)

    def inline_css(self, css_path):
        css = cssutils.parseFile(css_path)
        document = self.html
        elms = {} # stores all inlined elements.
        for rule in css:
            if hasattr(rule, 'selectorText'):
                for element in document.cssselect(rule.selectorText):
                    if element not in elms:
                        elms[element] = cssutils.css.CSSStyleDeclaration()
                        inline_styles = element.get('style')
                        if inline_styles:
                            for p in cssutils.css.CSSStyleDeclaration(cssText=inline_styles):
                                elms[element].setProperty(p)

                    for p in rule.style:
                        elms[element].setProperty(p.name, p.value, p.priority)

        # Set inline style attributes unless the element is not worth styling.
        for element, style in elms.iteritems():
            if element.tag not in ignore_list:
                element.set('style', style.getCssText(separator=u''))

    def tag_links(self, queryargs):
        #add tracking variable to links
        for a in self.html.xpath('//a'):
            href = a.get('href')
            # regex could be done in xpath, but then I'd have to kill myself
            if re.match('^https?://[a-z0-9-.]*newhive.com', href):
                a.set('href', utils.modify_query(href, queryargs))

    def tounicode(self):
        return etree.tounicode(self.html, method="xml", pretty_print=True)

def send_mail(headers, body, category=None, filters=None, unique_args=None):
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
    if category or unique_args or filters:
        smtpapi = {}
        if category:    smtpapi.update({'category': category})
        if unique_args: smtpapi.update({'unique_args': unique_args})
        if filters:     smtpapi.update({'filters': filters})
        msg['X-SMTPAPI'] = to_json(smtpapi)

    # Message body assembly
    if type(body) == dict:
        if body.has_key('plain'):
            plain = MIMEText(body['plain'].encode('utf-8'), 'plain', 'UTF-8')
            msg.attach(plain)
        if body.has_key('html'):
            html = MIMEText(body['html'].encode('utf-8'), 'html', 'UTF-8')
            msg.attach(html)
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
    if send_real_email and (config.live_server or msg['To'] in config.admin_emails):
        t0 = time.time()
        sent = smtp.sendmail(msg['From'], msg['To'].split(','), encoded_msg)
        logger.debug('SMTP sendmail time %d ms', (time.time() - t0) * 1000)
        return sent
    else:
        logger.warn("Not sending mail to %s in debug mode" % (msg['To']))


#registry = []
class MetaMailer(type):
    registry = []
    def __new__(cls, clsname, bases, attrs):
        newclass = super(cls, MetaMailer).__new__(cls, clsname, bases, attrs)
        # register non-abstract mailers
        if hasattr(newclass, 'name'):
            assert hasattr(newclass, 'sent_to')
            cls.registry.append(newclass)
        return newclass

    @classmethod
    def unsubscribable(cls, type):
        def test(x):
            return x.unsubscribable and type in x.sent_to
        return filter(test, cls.registry)

class Mailer(object):
    __metaclass__ = MetaMailer
    recipient = None
    initiator = None
    unsubscribable = True
    inline_css = True

    def __init__(self, jinja_env=None, db=None):
        self.db = db
        self.jinja_env = jinja_env

    def check_subscription(self):
        # check subscription status
        if isinstance(self.recipient, newhive.state.User):
            subscriptions = self.recipient.get('email_subscriptions', config.default_email_subscriptions)
            unsubscribed = self.unsubscribable and not self.name in subscriptions
        else:
            unsub = self.db.Unsubscribes.fetch(self.recipient['email'], keyname='email')
            unsubscribed = unsub and (unsub.get('all') or self.initiator.id in unsub.get('users'))
        return not unsubscribed

    def body(self, context):
        body = {}
        try:
            html_string = self.jinja_env.get_template(self.template + ".html").render(context)
            html = EmailHtml(html_string)
            html.tag_links({'email_id': context.get('email_id')})
            if self.inline_css and not css_debug:
                dir = '/libsrc/' if config.debug_mode else '/lib/'
                html.inline_css(config.src_home + dir + "email.css")
            body['html'] = html.tounicode()
        except TemplateNotFound as e:
            if e.message != self.template + '.html': raise e

        try: body['plain'] = self.jinja_env.get_template(self.template + ".txt").render(context)
        except TemplateNotFound: pass

        return body

    def heads(self):
        heads = {
             'To' : self.recipient.get('email')
            ,'Subject' : self.subject
            }
        return heads


    def send_mail(self, context=None, filters=None, **kwargs):
        if not filters: filters = {}
        if not context: context = {}

        email_id = str(pymongo.objectid.ObjectId())

        record = {'_id': email_id, 'email': self.recipient.get('email'), 'category': self.name }
        if type(self.recipient) == newhive.state.User:
            record.update({'recipient': self.recipient.id, 'recipient_name': self.recipient.get('name')})
        if type(self.initiator) == newhive.state.User:
            record.update({'initiator': self.initiator.id, 'initiator_name': self.initiator.get('name')})

        # Bypass sendgrid list management, we have our own system
        filters.update(bypass_list_management={'settings': {'enable': 1}})
        if self.unsubscribable:
            if isinstance(self.recipient, newhive.state.User):
                context.update({
                    'unsubscribe_url': abs_url(secure=True) + "settings"
                    , 'unsubscribe_text': "To manage your email subscriptions"
                    })
            else:
                context.update({
                    'unsubscribe_url': abs_url(secure=True) + "unsubscribe"
                    , 'unsubscribe_text': "To unsubscribe from this or all emails from newhive"
                     })

        # build heads and body
        context.update({
           'type': self.name
           , 'email_id': email_id
           , 'css_debug': css_debug and self.inline_css
           })
        body = self.body(context)
        heads = self.heads()
        heads.update(To=self.recipient.get('email'))

        subscribed = self.check_subscription()
        record.update(sent=subscribed)

        logger.info("to: {}\tname: {}\tstatus: {}".format(
            self.recipient.get('email')
            , self.name
            , 'unsubscribed' if not subscribed else 'sent'
            ))

        # write e-mail to file for debugging
        if not config.live_server:
            path = '/lib/tmp/' + email_id + '.html'
            with open(config.src_home + path, 'w') as f:
                f.write('<div><pre>')
                for key, val in heads.items():
                    s = u"{:<20}{}\n".format(key + u":", val)
                    f.write(s.encode('utf-8'))
                f.write('</pre></div>')
                f.write(body['html'].encode('utf-8'))
            logger.debug('temporary e-mail path: ' + abs_url(secure=True) + path)
            record.update(debug_url=abs_url(secure=True) + path)

        if subscribed:
            send_mail(heads, body, filters=filters, category=self.name, **kwargs)

        self.db.MailLog.create(record)

class SiteReferral(Mailer):
    name = 'site_referral'
    unsubscribable = False
    sent_to = ['nonuser']
    template = 'emails/invitation'
    subject = "You have a beta invitation to thenewhive.com"

    def send(self, email, name=False, force_resend=False):
        self.recipient = {'email': email, 'name': name}

        user = self.db.User.named(config.site_user)
        referral = user.new_referral({'name': name, 'to': email})

        context = {
            'recipient': self.recipient
            , 'url': referral.url
            , 'logo': self.db.assets.url('skin/1/newhive_logo_lg.png')
            }

        self.send_mail(context)
        return referral.id

class EmailConfirmation(Mailer):
    name = 'email_confirmation'
    unsubscribable = False
    sent_to = ['user']
    template = 'emails/email_confirmation'
    subject = 'Confirm change of e-mail address for thenewhive.com'
    inline_css = False

    def send(self, user, email, request_date):
        self.recipient = user
        secret = crypt.crypt(email, "$6$" + str(request_date))
        link = abs_url(secure=True) +\
                "email_confirmation?user=" + user.id +\
                "&email=" + urllib.quote(email) +\
                "&secret=" + urllib.quote(secret)
        context = {
            'user_fullname' : user['fullname']
            ,'user_name': user['name']
            ,'link' : link
            }
        self.send_mail(context)

class TemporaryPassword(Mailer):
    name = 'temporary_password'
    unsubscribable = False
    sent_to = ['user']
    template = 'emails/password_recovery'
    subject = 'Password recovery for thenewhive.com'
    inline_css = False

    def send(self, user, recovery_link):
        self.recipient = user
        context = {
            'recovery_link': recovery_link
            ,'user_fullname' : user['fullname']
            ,'user_name': user['name']
            }
        self.send_mail(context)

class ExprAction(Mailer):

    @property
    def recipient(self): return self.feed.entity.owner
    @property
    def initiator(self): return self.feed.initiator
    @property
    def subject(self): return self.initiator.get('name') + ' ' + ' '.join(self.header_message)
    sent_to = ['user']
    template = "emails/expr_action"

    @property
    def featured_expressions(self):
        exprs = self.initiator.get_top_expressions(6)
        if exprs.count() >= 6: return exprs

    def send(self, context=None):
        if not context: context = {}

        context.update({
            'message': self.message
            ,'initiator': self.initiator
            ,'recipient': self.recipient
            , 'header': self.header_message
            , 'expr': self.card
            , 'server_url': abs_url()
            , 'featured_exprs': self.featured_expressions
            })
        icon = self.db.assets.url('skin/1/email/' + self.name + '.png', return_debug=False)
        if icon: context.update(icon=icon)

        sendgrid_args = {
            'initiator': self.initiator and self.initiator.get('name')
            , 'expr_id': self.card.id
            }
        self.send_mail(context, unique_args=sendgrid_args)

class Comment(ExprAction):
    name = 'comment'
    @property
    def message(self): return self.feed.get('text')

    header_message = ['commented', 'on your expression']

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
    sent_to = ['nonuser']
    template = 'emails/thank_you_register'
    subject = 'Thank you for creating an account on thenewhive.com'
    inline_css = False

    def send(self, user):
        self.recipient = user
        user_profile_url = user.url
        user_home_url = re.sub(r'/[^/]*$', '', user_profile_url)
        context = {
            'user_fullname' : user['fullname']
            , 'user_home_url' : user_home_url
            , 'user_home_url_display' : re.sub(r'^https?://', '', user_home_url)
            , 'user_profile_url' : user_profile_url
            , 'user_profile_url_display' : re.sub(r'^https?://', '', user_profile_url)
            }
        self.send_mail(context)

class ShareExpr(ExprAction):

    name = 'share_expr'
    header_message = ['has sent', 'you an expression']
    recipient = None
    initiator = None
    sent_to = ['user', 'nonuser']

    def send(self, expr, initiator, recipient, message):
        self.card = expr
        self.initiator = initiator
        self.recipient = recipient
        self.message = message
        context = {}
        if not hasattr(self.recipient, 'id'):
            referral = initiator.new_referral(
                    {'to': recipient.get('email'), 'type': 'email'}
                    , decrement=False)
            context['signup_url'] = referral.url
        super(ShareExpr, self).send(context)

class Featured(ExprAction):
    name = 'featured'
    sent_to = ['user']
    unsubscribable = True
    header_message = ['Congratulations.', 'We featured your expression!']
    message = 'We added your expression to the featured collection.'
    initiator = None
    recipient = None
    featured_expressions = None
    subject = "Congratulations, we featured your expression!"
    template = "emails/featured"

    def send(self, expr):
        self.recipient = expr.owner
        self.card = expr
        super(Featured, self).send()

class Milestone(Mailer):
    name = 'milestone'
    sent_to = ['user']
    subject = None
    template = "emails/milestone"

    def send(self, expr, milestone):
        self.recipient = expr.owner
        context = {
            'message': ui.milestone_message
            , 'expr': expr
            , 'milestone': milestone
            , 'server_url': abs_url()
            }

        self.subject = u'Your expression "{}" has {} views'.format(expr['title'], milestone)
        sendgrid_args = {'expr_id': expr.id, 'milestone': milestone}

        self.send_mail(context, unique_args=sendgrid_args)

class SignupRequest(Mailer):
    name = 'signup_request'
    sent_to = ['nonuser']
    template = "emails/signup_request"
    unsubscribable = False
    subject = 'Thank you for signing up for a beta account on The New Hive'
    header_message = ['<span class="active">Thank you</span> for signing', 'up for a beta account. :)']
    message = "We are getting The New Hive ready for you.<br/>" + \
              "Expect to get a beta invitation in your inbox ASAP.<br/>" + \
              "We look forward to seeing your expressions!<br/><br/>" + \
              "Talk to you soon,<br/><b>The New Hive team</b>"

    def send(self, email, name, unique_args):
        self.recipient = {'email': email, 'name': name}
        context = {
            'featured_exprs': self.db.Expr.featured(6)
            , 'recipient': self.recipient
            , 'message': self.message
            , 'message_safe': True
            , 'header': self.header_message
            }
        self.send_mail(context, unique_args=unique_args)

class UserReferral(Mailer):
    name = 'user_referral'
    sent_to = ['nonuser']
    template = "emails/invitation"
    unsubscribable = True

    @property
    def subject(self): return self.initiator.get('fullname') + ' has invited you to The New Hive'

    def send(self, referral, initiator):
        self.initiator = initiator
        self.recipient = {'email': referral['to']}
        context = {
            'initiator': initiator
            , 'recipient': {'name': referral.get('name')}
            , 'url': referral.url
            , 'logo': self.db.assets.url('skin/1/newhive_logo_lg.png')
            }
        self.send_mail(context, unique_args={'referral_id': referral.id})
