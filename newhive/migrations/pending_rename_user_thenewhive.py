from newhive import state
db = state.Database()

def rename_user(old_name, name):
    u = db.User.named(old_name)
    u.update(name=name)
    updated = 1
    for r in db.Expr.search({'owner':u.id}):
        r.update(owner_name=name)
        updated += 1
    for r in db.Feed.search({'initiator':u.id}):
        r.update(initiator_name=name)
        updated += 1
    print('updated %i records, %s is now %s' % (updated, old_name, name))

def rename_user_thenewhive():
    rename_user('thenewhive', 'newhive')
