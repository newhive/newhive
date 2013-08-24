from itertools import chain
from newhive.controllers.shared import *
from newhive.controllers import Application
from newhive.utils import now
from newhive.analytics.analytics import user_expression_summary
import newhive.analytics.queries
import newhive.mail
from newhive import config


class Cron(Application):
    key = 'VaUcZjzozgiV'

    def cron(self, request, response):
        """ Reads intenal crontab, list of tuples of the format:

            (Cron Format String, Method Name, Method Options Dictionary)

            Cron Format String is a simplified cron format of the form:
                min hour

            """

        method_name = lget(request.path_parts, 1)
        method = getattr(self, method_name)
        if not request.is_secure or not method or (request.args.get('key') != self.key):
            return self.serve_404(request, response)

        opts_serial = dfilter(request.args, ['delay', 'span'])
        opts = dict((k, int(v)) for k, v in opts_serial.iteritems())

        status = method(**opts)
        status.update({'timestamp': now(), 'args': opts})
        return self.serve_json(response, status)


    def email_star_broadcast(self, delay=0, span=600):
        spec = {'send_email': True, 'created': {"$gt": now() - delay - span, "$lt": now() - delay } }

        stats = { 'send_count': 0, 'matched': 0 }
        mailer = newhive.mail.Feed(db = self.db, jinja_env = self.jinja_env)
        def send(item):
            stats['matched'] += 1
            if item.initiator.id == item.entity.owner.id: return
            mailer.send(item)
            stats['send_count'] += 1
            item.update(send_email=False, email_sent=now())

        for item in self.db.Star.search(spec): send(item)
        for item in self.db.Broadcast.search(spec): send(item)

        return stats

    @classmethod
    def _milestone_check(self, expr):

        def latest_milestone(n):
            for m in reversed(config.milestones):
                if m <= n: return m
            return 0

        views = expr.get('views', 0)
        milestones = expr.get('milestones')
        last_milestone = max([int(m) for m in milestones.keys()]) if milestones else 0
        new_milestone = latest_milestone(views)

        seconds_since_last = now() - max(milestones.values()) if milestones else float('inf')
        if new_milestone > last_milestone and seconds_since_last > 86400:
            median = user_expression_summary(expr.owner).views.median()
            if new_milestone >= median:
                return new_milestone
        return False

    @classmethod
    def _email_milestone_send(self, expr, mailer):
        milestone = self._milestone_check(expr)
        if milestone:
            expr_milestones = expr.get('milestones', {})
            expr_milestones.update({str(milestone): now()})
            expr.update(milestones=expr_milestones, updated=False)
            mailer.send(expr, milestone)
            return milestone
        return False


    def email_milestone(self):
        mailer = newhive.mail.Milestone(db = self.db, jinja_env = self.jinja_env)
        stats = { 'send_count': 0}
        for expr in self.db.Expr.search({'auth': 'public', 'views': {'$gt': 0}}):
            sent = self._email_milestone_send(expr, mailer)
            if sent:
                stats['send_count'] += 1

        return stats

    def site_referral_reminder(self, delay=48*3600, span=60):
        spec = {
                'user_created': {'$exists': False}
                , 'reuse': {'$exists': False}
                , 'user': self.db.User.site_user.id
                , 'created': {'$gt': now() - delay - span, '$lt': now() - delay }
                , 'to': re.compile(r'@')
                }
        stats = {'send_count': 0}

        mailer = newhive.mail.SiteReferralReminder(db=self.db, jinja_env=self.jinja_env)

        sent_emails = []
        for referral in self.db.Referral.search(spec):
            address = referral.get('to')
            if address not in sent_emails:
                mailer.send(referral)
                referral.update_cmd({'$push': {'reminder_sent': now()}})
                stats['send_count'] += 1
                sent_emails.append(address)

        return stats

    def user_invites_reminder(self, delay=0, span=0):
        mailer = newhive.mail.UserInvitesReminder(db = self.db, jinja_env = self.jinja_env)
        stats = {'send_count': 0}

        spec = {
                'created': {'$gt': now() - span - delay, '$lt': now() - delay}
                , 'referrals': config.initial_invite_count
                }
        for user in self.db.User.search(spec):
            mailer.send(user)
            stats['send_count'] += 1

        return stats

    def analytics(self):
        newhive.analytics.queries.clear_all_caches()
        mailer = newhive.mail.Analytics(db = self.db, jinja_env = self.jinja_env)
        mailer.send('team@newhive.com')

        stats = {'send_count': 1}
        return stats
