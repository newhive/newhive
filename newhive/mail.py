import crypt, urllib, time, json, re, pymongo, random
from cStringIO import StringIO
from smtplib import SMTP
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
from email.generator import Generator
from email import Charset
from jinja2 import TemplateNotFound
from werkzeug import url_unquote
import cssutils
from lxml import etree
import lxml.html
import logging

import newhive.state
from newhive.state import abs_url
from newhive.utils import AbsUrl
from newhive import config, utils
from newhive.server_session import db, server_env, jinja_env, hive_assets
import newhive.ui_strings.en as ui
from newhive.analytics import analytics
from newhive.manage.ec2 import public_hostname

import bson.objectid

logger = logging.getLogger(__name__)
send_real_email = True
css_debug = False

Charset.add_charset('utf-8', Charset.QP, Charset.QP, 'utf-8')

class EmailHtml(object):
    ignore_list = ['html', 'head', 'title', 'meta', 'link', 'script']

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
            if element.tag not in self.ignore_list:
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

def _send_mail(headers, body, db, category=None, filters=None, unique_args=None, smtp=None):
    def to_json(data):
        j = json.dumps(data)
        return re.compile('(["\]}])([,:])(["\[{])').sub('\1\2 \3', j)

    # smtp connection setup and timings
    t0 = time.time()
    if not smtp:
        smtp = SMTP(config.email_server, config.email_port)
        if config.email_user and config.email_password:
            smtp.login(config.email_user, config.email_password)
        logger.debug('SMTP connection time %d ms', (time.time() - t0) * 1000)

    # Message header assembly
    msg = MIMEMultipart('alternative')
    msg['Subject'] = Header(headers['Subject'].encode('utf-8'), 'UTF-8').encode()
    msg['To'] = headers['To']
    msg['From'] = headers.get('From', 'NewHive <noreply@newhive.com>')

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
    if config.debug_mode:
        with open(config.src_home + '/log/last_email.txt', 'w') as f: f.write(encoded_msg)

    if not config.live_server:
        test_emails = [r['email'] for r in db.User.search(
            {'name': {'$in': config.admins} }) ]

    # Send mail, but if we're in debug mode only send to admins
    send_email = send_real_email
    # Why can't we break into separate emails? smtp.sendmail accepts "to" field but
    # sends it to the To in encoded_msg anyway!
    # Ensure ALL TO: emails are in test_emails
    if send_email and not config.live_server:
        for to in (msg['To'] or '').split(','):
            if not to in test_emails:
                send_email = False
                break
    if send_email:
        t0 = time.time()
        sent = smtp.sendmail(msg['From'], (msg['To'] or '').split(','), encoded_msg)
        logger.debug('SMTP sendmail time %d ms', (time.time() - t0) * 1000)
        return sent
    else:
        logger.warn("Not sending mail to '%s' in debug mode" % (msg['To']))


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
    bcc = False

    def __init__(self, jinja_env=None, db=None, smtp=None):
        self.db = db
        self.jinja_env = jinja_env
        self.assets = hive_assets
        self.asset = self.assets.url
        # Note, these functions are taken from newhive/old/wsgi.py:56:
        jinja_env.filters.update( {
            'asset_url': hive_assets.url
            ,'clean_url': lambda s: re.match('https?://([^?]*)', s).groups()[0]
            ,'html_breaks': lambda s: re.sub('\n', '<br/>', unicode(s))
            ,'large_number': utils.large_number
            ,'modify_query': utils.modify_query
            ,'number': lambda n: '{:,}'.format(n)       # adds ',' thousands separator
            ,'urlencode': lambda s: urllib.quote(s.encode('utf8'))
            })
        t0 = time.time()
        if smtp:
            self.smtp = smtp
        else:
            self.smtp = SMTP(config.email_server, config.email_port)
            if config.email_user and config.email_password:
                self.smtp.login(config.email_user, config.email_password)
            logger.debug('SMTP connection time %d ms', (time.time() - t0) * 1000)


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
                html.inline_css(config.src_home + dir + "compiled.email.css")
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
        if self.bcc and self.initiator:
            heads.update({'To': heads['To'] + "," + self.initiator.get('email')})
        return heads


    def send_mail(self, context=None, filters=None, **kwargs):
        if not filters: filters = {}
        if not context: context = {}

        email_id = str(bson.objectid.ObjectId())

        record = {'_id': email_id, 'email': self.recipient.get('email'), 'category': self.name }
        if type(self.recipient) == newhive.state.User:
            record.update({'recipient': self.recipient.id, 'recipient_name': self.recipient.get('name')})
        if type(self.initiator) == newhive.state.User:
            record.update({'initiator': self.initiator.id, 'initiator_name': self.initiator.get('name')})
        if kwargs.has_key('unique_args'): record['unique_args'] = kwargs['unique_args']

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
           , 'server_url': AbsUrl()
           })

        if hasattr(self.__class__.__base__, 'name'):
            context['super_type'] = self.__class__.__base__.name

        body = self.body(context)
        heads = self.heads()
        # heads.update(To=self.recipient.get('email'))

        subscribed = self.check_subscription()
        record.update(sent=subscribed)

        logger.info("to: {}\tname: {}\tstatus: {}".format(
            self.recipient.get('email')
            , self.name
            , 'unsubscribed' if not subscribed else 'sent'
            ))

        # write e-mail to file for debugging
        # path = '/www_tmp/' + email_id + utils.junkstr(4) + '.html'
        # with open(config.src_home + path, 'w') as f:
        #     f.write('<div><pre>')
        #     for key, val in heads.items():
        #         s = u"{:<20}{}\n".format(key + u":", val)
        #         f.write(s.encode('utf-8'))
        #     f.write('</pre></div>')
        #     if body.has_key('html'):
        #         f.write(body['html'].encode('utf-8'))
        #     else:
        #         f.write('<pre style="font-family: sans-serif;">')
        #         f.write(body['plain'].encode('utf-8'))
        #         f.write('</pre>')
        # logger.debug('temporary e-mail path: ' + abs_url(secure=True) + path)
        # record.update(debug_url= 'https://' + public_hostname + path)

        if subscribed:
            _send_mail(heads, body, self.db, filters=filters, category=self.name, smtp=self.smtp, **kwargs)

        self.db.MailLog.create(record)

class EmailConfirmation(Mailer):
    name = 'email_confirmation'
    unsubscribable = False
    sent_to = ['user']
    template = 'emails/email_confirmation'
    subject = 'Confirm change of e-mail address for newhive.com'

    def send(self, user, email, request_date):
        self.recipient = user
        secret = crypt.crypt(email, "$6$" + str(request_date))
        link = abs_url(secure=True) +\
                "email_confirmation?user=" + user.id +\
                "&email=" + urllib.quote(email) +\
                "&secret=" + urllib.quote(secret)
        context = {
            'recipient': self.recipient
            ,'link' : link
            }
        self.send_mail(context)

class TemporaryPassword(Mailer):
    name = 'temporary_password'
    unsubscribable = False
    sent_to = ['user']
    template = 'emails/password_recovery'
    subject = 'Password recovery for newhive.com'

    def send(self, user, recovery_link):
        self.recipient = user
        context = {
            'recovery_link': recovery_link
            , 'recipient': self.recipient
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
    def featured_exprs(self):
        exprs = self.initiator.recent_expressions
        if exprs.count() >= 6:
            return (exprs, 'user')
        else:
            return (self.db.Expr.featured(6), 'site')

    def send(self, context=None):
        if not context: context = {}

        featured, featured_type = self.featured_exprs
        context.update({
            'message': self.message
            ,'initiator': self.initiator
            ,'recipient': self.recipient
            , 'header': self.header_message
            , 'expr': self.card
            , 'server_url': abs_url()
            , 'featured_exprs': featured
            , 'featured_type': featured_type
            })
        #bugbug: db.assets missing.
        # icon = self.db.assets.url('skin/1/email/' + self.name + '.png', return_debug=False)
        # if icon: context.update(icon=icon)

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
    template = 'emails/listen'
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
    def __init__(self, *args, **kwargs):
        super(Feed, self).__init__(*args, **kwargs)
        self.mailers = {}

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

        if not self.mailers.has_key(mailer_class):
            self.mailers[mailer_class] = mailer_class(self.jinja_env, self.db, smtp=self.smtp)
        mailer = self.mailers[mailer_class]
        mailer.feed = feed
        mailer.send()

class Welcome(Mailer):
    name = 'welcome'
    unsubscribable = False
    sent_to = ['nonuser']
    template = 'emails/welcome'
    subject = 'Welcome to NewHive! :)'

    def send(self, user):
        self.recipient = user
        user_profile_url = user.url
        user_home_url = re.sub(r'/[^/]*$', '', user_profile_url)
        context = {
            'recipient': user
            , 'create_link' : abs_url(secure=True) + "edit"
            , 'create_icon': self.asset('skin/1/create.png')
            , 'featured_exprs': self.db.Expr.featured(6)
            }
        self.send_mail(context)

class SendMail(Mailer):
    name = 'mail'
    unsubscribable = False
    sent_to = ['user']
    template = 'emails/mail'

    def send(self, recipient, initiator, message, bcc=False):
        self.subject = 'New message from %s' % initiator['name']
        self.recipient = recipient
        self.initiator = initiator
        self.bcc = bcc
        # user_profile_url = recipient.url
        # user_home_url = re.sub(r'/[^/]*$', '', user_profile_url)
        context = {
            'recipient': recipient
            , 'initiator' : initiator
            , 'message' : message
            }
        self.send_mail(context)

class ShareExpr(ExprAction):

    name = 'share_expr'
    header_message = ['has sent', 'you an expression']
    recipient = None
    initiator = None
    sent_to = ['user', 'nonuser']

    # def heads(self):
    #     heads = super(ShareExpr, self).heads()
    #     if self.bcc:
    #         heads.update({'To': heads['To'] + "," + self.initiator.get('email')})
    #     return heads

    def send(self, expr, initiator, recipient, message, bcc=False):
        self.card = expr
        self.initiator = initiator
        self.recipient = recipient
        self.message = message
        self.bcc = bcc
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
    featured_exprs = (None, None)
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
    subject = 'Thank you for signing up for a beta account on NewHive'
    header_message = ['<span class="active">Thank you</span> for signing', 'up for a beta account. :)']
    message = "We are getting NewHive ready for you.<br/>" + \
              "Expect to get a beta invitation in your inbox ASAP.<br/>" + \
              "We look forward to seeing your expressions!<br/><br/>" + \
              "Talk to you soon,<br/><b>The NewHive team</b>"

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
    def subject(self): return self.initiator.get('fullname') + ' has invited you to NewHive'

    def send(self, referral, initiator):
        self.initiator = initiator
        self.recipient = {'email': referral['to']}
        context = {
            'initiator': initiator
            , 'recipient': {'name': referral.get('name')}
            , 'url': referral.url
            }
        self.send_mail(context, unique_args={'referral_id': referral.id})

class SiteReferral(Mailer):
    name = 'site_referral'
    unsubscribable = False
    sent_to = ['nonuser']
    template = 'emails/invitation'
    subject = "Congratulations, here is your NewHive invite!"

    def send(self, email, name=False, force_resend=False):
        self.recipient = {'email': email, 'name': name}

        user = self.db.User.site_user
        referral = user.new_referral({'name': name, 'to': email})

        context = {
            'recipient': self.recipient
            , 'url': referral.url
            }

        self.send_mail(context)
        return referral.id

class SiteReferralReminder(SiteReferral):
    name = 'site_referral_reminder'
    unsubscribable = True
    template = 'emails/invitation_reminder'
    subject = "A friendly reminder to create your NewHive account"

    def send(self, referral):
        self.recipient = {'email': referral.get('to'), 'name': referral.get('name')}

        messages = {
                "A": "We noticed you recently signed up for NewHive, your online blank canvas. Congratulations, you've been invited to join the beta party! Click the link below to create your account and reserve your URL. :)"
                , "B": "Just one more step and you are a part of NewHive's exclusive beta test! Click on the link below to create your profile and start expressing yourself. :)"
                , "C": "We noticed you recently signed up for NewHive, your online blank canvas. Click on the link below to join the party!"
                }

        version, message = random.choice(messages.items())

        context = {
                'recipient': self.recipient
                , 'url': referral.url
                , 'message': message
                }

        self.send_mail(context, unique_args={'referral_id': referral.id, 'version': version})

class UserInvitesReminder(Mailer):
    name = 'user_invites_reminder'
    unsubscribable = False
    template = "emails/user_invites_reminder"
    sent_to = ['user']

    @property
    def subject(self):
        return "You've got {} invites to share from NewHive beta.".format(self.recipient.get('referrals'))

    def send(self, user):
        self.recipient = user
        if not user.get('referrals'):
            logger.info('not sending invites reminder to {}, no referrals available'.format(user['name']))
            return

        url = utils.AbsUrl()
        url.query.update({'loadDialog': 'email_invites'})
        context = {
                'recipient': self.recipient
                , 'url': url}

        self.send_mail(context)

class Analytics(Mailer):
    name = 'analytics'
    unsubscribable = False
    template = "emails/analytics"
    sent_to = ['nonuser']
    subject = 'Daily Analytics Summary'
    inline_css = True

    def send(self, address):
        self.recipient = {'email': address, 'name': 'Team'}
        context = {
                'summary': analytics.summary(self.db),
                'link': AbsUrl('analytics/dashboard'),
                'date': utils.local_date(-1)
                }

        self.send_mail(context)
