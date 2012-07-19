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


    def email_star_broadcast(self, delay=60, span=60):
        spec = {'send_email': True, 'created': {"$gt": now() - delay - span, "$lt": now() - delay } }

        stats = { 'send_count': 0, 'matched': 0 }
        def send(item):
            stats['matched'] += 1
            recipient = item.entity.owner
            if item.initiator.id == recipient.id: return
            headers = newhive.mail.mail_feed(self.jinja_env, item, recipient, dry_run = False)
            stats['send_count'] += 1
            item.update(send_email=False, email_sent=now())

        for item in self.db.Star.search(spec): send(item)
        for item in self.db.Broadcast.search(spec): send(item)

        return stats
