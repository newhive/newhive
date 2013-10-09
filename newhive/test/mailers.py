# Run from src root:
# python -m unittest newhive.test.mailers
# python -m unittest newhive.test.mailers.ShareExpr


import unittest, random
from newhive.server_session import db, server_env, jinja_env, hive_assets
from newhive import mail, config, state, app

import os.path

mail.send_real_email = False
# mail.css_debug = True

import functools
def debug_on(*exceptions):
    if not exceptions:
        exceptions = (AssertionError, )
    def decorator(f):
        @functools.wraps(f)
        def wrapper(*args, **kwargs):
            try:
                return f(*args, **kwargs)
            except exceptions:
                pdb.post_mortem(sys.exc_info()[2])
        return wrapper
    return decorator

import pdb 
class MailerTest(unittest.TestCase):
    def setUp(self):
        self.test_user = db.User.named('test')
        self.test_nonuser = {'email': 'test+nonuser@newhive.com', 'name': 'Nonuser'}
        # pdb.set_trace()

    def get_expr(self):
        #return db.Expr.fetch("504fb8e063dade0b7401d422") # contains unicode title
        #return random.choice(db.User.named('dain').expressions) # dain's expressions all have long titles/tags/urls and unicode in the title
        return db.Expr.random()

    def get_user(self):
        return db.Expr.random().owner

class ShareExpr(MailerTest):
    @debug_on()
    def setUp(self):
        super(ShareExpr, self).setUp()
        self.mailer = mail.ShareExpr(db=db, jinja_env=jinja_env)
        self.message = 'test message\nsecond line'

    def test_to_nonuser(self):
        expr = self.get_expr()
        initiator = self.test_user
        recipient = {'email': 'a@newhive.com'}
        self.mailer.send(expr, initiator, recipient, self.message)

    def test_to_user(self):
        expr = self.get_expr()
        initiator = self.test_user
        recipient = db.User.named('abram')
        self.mailer.send(expr, initiator, recipient, self.message)

class SiteReferral(MailerTest):
    def setUp(self):
        super(SiteReferral, self).setUp()
        self.mailer = mail.SiteReferral(db=db, jinja_env=jinja_env)

    def test_site_referral(self):
        self.mailer.send('test@newhive.com', 'Name')

class EmailConfirmation(MailerTest):
    def setUp(self):
        super(EmailConfirmation, self).setUp()
        self.mailer = mail.EmailConfirmation(db=db, jinja_env=jinja_env)

    def test_email_confirmation(self):
        self.mailer.send(self.test_user, 'test@newhive.com', request_date=now())

class TemporaryPassword(MailerTest):
    def setUp(self):
        super(TemporaryPassword, self).setUp()
        self.mailer = mail.TemporaryPassword(db=db, jinja_env=jinja_env)

    def test_temporary_password(self):
        self.mailer.send(self.test_user, abs_url() + 'fakerecoverylink')

class FeedMailerTest(MailerTest):
    def setUp(self):
        super(FeedMailerTest, self).setUp()
        self.mailer = mail.Feed(db=db, jinja_env=jinja_env)

class Comment(FeedMailerTest):
    def test_comment(self):
        comment = db.Comment.last()
        self.mailer.send(comment)

class UserStar(FeedMailerTest):
    def test_listen(self):
        star = db.Star.last({'entity_class': 'User'})
        self.mailer.send(star)

class ExprStar(FeedMailerTest):
    def test_love(self):
        star = db.Star.last({'entity_class': 'Expr'})
        self.mailer.send(star)

class Broadcast(FeedMailerTest):
    def test_broadcast(self):
        broadcast = db.Broadcast.last()
        self.mailer.send(broadcast)

class MultiFeedTest(FeedMailerTest):
    def test_multiple_feeds(self):
        newhive.test.logger.debug('test_multiple_feeds\n')
        for feed in db.Star.search({'entity_class': 'Expr'}, sort=[('created', -1)], limit=2):
            self.mailer.send(feed)
        for feed in db.Star.search({'entity_class': 'User'}, sort=[('created', -1)], limit=2):
            self.mailer.send(feed)
        for feed in db.Broadcast.search({}, sort=[('created', -1)], limit=2):
            self.mailer.send(feed)

class Welcome(MailerTest):
    def setUp(self):
        super(Welcome, self).setUp()
        self.mailer = mail.Welcome(db=db, jinja_env=jinja_env)

    def test_welcome(self):
        self.mailer.send(self.get_user())

class Featured(MailerTest):
    def setUp(self):
        super(Featured, self).setUp()
        self.mailer = mail.Featured(db=db, jinja_env=jinja_env)

    def test_featured(self):
        expr = self.get_expr()
        self.mailer.send(expr)

class Milestone(MailerTest):
    def setUp(self):
        super(Milestone, self).setUp()
        self.mailer = mail.Milestone(db=db, jinja_env=jinja_env)

    def test_milestone(self):
        expr = self.get_expr()
        self.mailer.send(expr, random.choice(config.milestones))

class SignupRequest(MailerTest):
    def setUp(self):
        super(SignupRequest, self).setUp()
        self.mailer = mail.SignupRequest(db=db, jinja_env=jinja_env)

    def test_signup_request(self):
        self.mailer.send(self.test_nonuser['email'], self.test_nonuser['name'], {})

class UserReferral(MailerTest):
    def setUp(self):
        super(UserReferral, self).setUp()
        self.mailer = mail.UserReferral(db=db, jinja_env=jinja_env)

    def test_user_referral(self):
        recipient = {'name': self.test_nonuser['name'], 'to': self.test_nonuser['email']}
        referral = self.test_user.new_referral(recipient, decrement=False)
        self.mailer.send(referral, self.test_user)

class SiteReferralReminder(MailerTest):
    def setUp(self):
        super(SiteReferralReminder, self).setUp()
        self.mailer = mail.SiteReferralReminder(db=db, jinja_env=jinja_env)

    def test_site_referral_reminder(self):
        spec = {
                'user_created': {'$exists': False}
                , 'reuse': {'$exists': False}
                , 'user': db.User.site_user.id
                }
        offset = random.randint(1,100)
        ref = db.Referral.search(spec, sort=[('created', -1)], offset=offset, limit=1)[0]
        self.mailer.send(ref)

class UserInvitesReminder(MailerTest):
    def setUp(self):
        super(UserInvitesReminder, self).setUp()
        self.mailer = mail.UserInvitesReminder(db=db, jinja_env=jinja_env)

    def test_user_invites_reminder(self):
        user = self.get_user()
        self.mailer.send(user)

if __name__ == '__main__':
    unittest.main()
