import wsgi
from state import now

print wsgi.jinja_env.get_template('emails/feed.txt')
items = wsgi.Star.search(created={"$gt": now() - 60*60*24, "$lt": now() - 60*10})
for item in items:
  if item.get('entity_class') == "User":
    recipient = item.entity
  elif item.get('entity_class') == "Expr":
    recipient = item.entity.owner
  print recipient.get('name')
#  mail_feed(item, recipient, dry_run=True)

