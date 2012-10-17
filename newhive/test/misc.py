import unittest
from newhive import state, config
import newhive.controllers.cron

db = state.Database(config)

class MilestoneCheck(unittest.TestCase):

    def setUp(self):
        self.f = newhive.controllers.cron.Cron._email_milestone_send
        self.expr = db.Expr.find({'owner': db.User.named('test').id})
        class MockMailer(object):
            def send(self, *args, **kwargs): pass
        self.mailer = MockMailer()

    def test_milestone_0(self):
        self.expr.update(milestones={'0': 0}, views=1)
        milestone = self.f(self.expr, self.mailer)
        self.assertEqual(milestone, 0)

    def test_milestone_20(self):
        self.expr.update(milestones={'0': 0}, views=20)
        milestone = self.f(self.expr, self.mailer)
        self.assertEqual(milestone, 20)

    def test_milestone_30(self):
        self.expr.update(milestones={'0': 0}, views=30)
        milestone = self.f(self.expr, self.mailer)
        self.assertEqual(milestone, 20)

    def test_milestone_50(self):
        self.expr.update(milestones={'0': 0}, views=50)
        milestone = self.f(self.expr, self.mailer)
        self.assertEqual(milestone, 50)

    def test_no_milestone(self):
        self.expr.update(milestones={'20': 0}, views=30)
        milestone = self.f(self.expr, self.mailer)
        self.assertIs(milestone, False)
