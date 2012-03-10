from newhive.state import Database
from newhive import config
db = Database(config)

def convert_group(user):
    groups = user['groups']
    user['groups'] = {}

    for group in groups:
        if group == 'fb_connect_2':
            user.add_group('fbc', 1)
        if user['name'] in config.beta_testers:
            user.add_group('fbc', 0)

def convert_groups():
    for u in db.User.search({'groups': {'$exists': True}}):
        if u.has_key('groups'):
            print "Username: " + str(u['name'])
            print "Before:   " + str(u['groups'])
            convert_group(u)
            u.save()
            print "After:    " + str(u['groups'])
