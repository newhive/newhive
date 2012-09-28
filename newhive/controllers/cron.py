from itertools import chain
from newhive.controllers.shared import *
from newhive.controllers import Application
from newhive.utils import now
import newhive.mail

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
        return self.serve_json(response, status)


    def email_star_broadcast(self, delay=0, span=600):
        spec = {'send_email': True, 'created': {"$gt": now() - delay - span, "$lt": now() - delay } }

        stats = { 'send_count': 0, 'matched': 0 }
        mailer = newhive.mail.Feed(jinja_env = self.jinja_env)
        def send(item):
            stats['matched'] += 1
            if item.initiator.id == item.entity.owner.id: return
            mailer.send(item)
            stats['send_count'] += 1
            item.update(send_email=False, email_sent=now())

        for item in self.db.Star.search(spec): send(item)
        for item in self.db.Broadcast.search(spec): send(item)

        return stats

    def email_milestone(self, expr):
        milestones = [20, 50] + [int(math.pow(10, n)) for n in range(2,8)]
        def next_milestone(n):
            for m in milestones:
                if m > n: return m

        mailer = newhive.mail.Milestone(jinja_env = self.jinja_env)
        def send(expr):
            expr_milestones = expr.get('milestones', {})
            last_milestone = max([int(m) for m in expr_milestones.keys()])
            next = next_milestone(last_milestone)

            if expr.get('views', 0) >= next:
                expr_milestones.update({str(next): now()})
                expr.update(milestones=expr_milestones)
                mailer.send(expr, next)

        for expr in self.db.Expr({'auth': 'public', 'views': {'$gt': 0}}):
            send(expr)
