from itertools import chain
from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
from newhive.utils import now
import newhive.mail

class CronController(ApplicationController):

    def cron(self, request, response):
        """ Reads intenal crontab, list of tuples of the format:

            (Cron Format String, Method Name, Method Options Dictionary)

            Cron Format String is a simplified cron format of the form:
                min hour

            """
        if request.remote_addr != '127.0.0.1':
            return self.serve_404(request, response)

        t = datetime.now()
        crontab = [
                ("* *", "email_star_broadcast", {'delay': 1, 'frequency': 1})
                ]

        log = "Cron ran the following commands: "
        for entry in crontab:
            if self._cronmatch(t, entry[0]):
                log = log + entry[1] + ", "
                getattr(self, entry[1])(entry[2])

        return self.serve_json(response, log + "\n")


    def email_star_broadcast(self, opts):
        logfile = open(config.src_home + '/log/email_star.log', 'a')
        start = opts.get('delay') + opts.get('frequency')
        end = opts.get('delay')
        items = self.db.Star.search(
                {'created': {"$gt": now() - 60 * start, "$lt": now() - 60 * end}})
        items2 = self.db.Broadcast.search(
                {'created': {"$gt": now() - 60 * start, "$lt": now() - 60 * end}})
        for item in chain(items, items2):
            recipient = item.entity.owner
            if item.initiator.id == recipient.id: continue
            headers = newhive.mail.mail_feed(self.jinja_env, item, recipient, dry_run = False)
            logfile.write('\n' + time.strftime("%a, %d %b %Y %H:%M:%S +0000", time.localtime(time.time())) + " " * 4 + headers['To'] + ' ' * ( 50 - len(headers['To']) )  + headers['Subject'] )
        logfile.close()

    def _cronmatch(self, time, string):

        def fieldmatch(time, field):
            if field == "*": return True
            if re.match('^\d+$', field) and time == int(field): return True
            match = re.match(r'^((\d+)-(\d+)|\*)\/(\d+)$', field)
            if match:
                splat, start, end, interval = match.groups()
                if splat == "*":
                    return True if time % int(interval) == 0 else False
                if time > int(start) and time < int(end) and (time - int(start)) % int(interval) == 0: return True
            return False

        fields = re.split("\s", string)
        if len(fields) != 2:
            raise Exception("Simple Cron Format string must be of the form 'min hour'")
        return fieldmatch(time.minute, fields[0]) and fieldmatch(time.hour, fields[1])
