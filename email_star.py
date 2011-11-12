#!/usr/bin/python
import time, optparse
import wsgi
from state import now

def main():
    logfile = open('log/email_star.log', 'a')
    parser = optparse.OptionParser()
    parser.add_option("-s", "--start", dest="start", type="int", help="how far back to look for star feed items, in minutes")
    parser.add_option("-e", "--end", dest="end", type="int", help="delay for star feed items, in minutes from present")
    parser.add_option("-D", "--dry-run", action="store_true", dest="dry_run")
    (options, args) = parser.parse_args()
    items = wsgi.Star.search(created={"$gt": now() - 60*options.start, "$lt": now() - 60*options.end})
    for item in items:
      if item.get('entity_class') == "User":
        recipient = item.entity
      elif item.get('entity_class') == "Expr":
        recipient = item.entity.owner
      if not item.initiator.id == recipient.id:
        headers = wsgi.mail_feed(item, recipient, options.dry_run)
        logfile.write('\n' + time.strftime("%a, %d %b %Y %H:%M:%S +0000", time.localtime(time.time())) + " " * 4 + headers['To'] + ' ' * ( 50 - len(headers['To']) )  + headers['Subject'] )
    logfile.close()

if __name__ == '__main__':
    main()
