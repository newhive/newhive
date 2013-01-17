from newhive.state import Database
import newhive.config

def main(db):
    # find all users that have changed their email subscriptions from the
    # default but not unsubscribed from everything
    spec = {'email_subscriptions': {'$exists': True, '$ne': []}}

    # then push the 'milestone' type onto their subscriptions
    update = {'$push': {'email_subscriptions': 'milestone'}}

    db.User._col.update(spec, update, multi=True)
