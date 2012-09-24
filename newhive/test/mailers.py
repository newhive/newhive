import unittest, random
from newhive.wsgi import db, jinja_env
from newhive.utils import abs_url, now
from newhive import mail, config
mail.send_real_email = False

class MailerTest(unittest.TestCase):
    def setUp(self):
        self.test_user = db.User.named('test')
        self.test_nonuser = {'email': 'test+nonuser@thenewhive.com', 'name': 'Nonuser'}

class ShareExpr(MailerTest):
    def setUp(self):
        super(ShareExpr, self).setUp()
        self.mailer = mail.ShareExpr(db=db, jinja_env=jinja_env)
        self.message = 'test message\nsecond line'

    def test_to_nonuser(self):
        expr = db.Expr.random()
        initiator = self.test_user
        recipient = {'email': 'duffytilleman@gmail.com'}
        self.mailer.send(expr, initiator, recipient, self.message)

    def test_to_user(self):
        expr = db.Expr.random()
        initiator = self.test_user
        recipient = db.User.named('duffy')
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

class UserRegisterConfirmation(MailerTest):
    def setUp(self):
        super(UserRegisterConfirmation, self).setUp()
        self.mailer = mail.UserRegisterConfirmation(db=db, jinja_env=jinja_env)

    def test_user_register_confirmation(self):
        self.mailer.send(self.test_user)

class Featured(MailerTest):
    def setUp(self):
        super(Featured, self).setUp()
        self.mailer = mail.Featured(db=db, jinja_env=jinja_env)

    def test_featured(self):
        expr = db.Expr.random()
        self.mailer.send(expr)

class Milestone(MailerTest):
    def setUp(self):
        super(Milestone, self).setUp()
        self.mailer = mail.Milestone(db=db, jinja_env=jinja_env)

    def test_milestone(self):
        expr = db.Expr.random()
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
