from datetime import datetime as DT
from time import mktime
from time import sleep

def then(*args): return mktime(DT(*args).timetuple())

u=db.User.named('heylisten');
goods = [i for ii in [r['file_id'] for r in list(db.Expr.search(mq(owner_name=u['name'])))] for i in ii]
for f in db.File.search(mq(owner=u.id).gt('updated', now() - 86400 * 3)):
    if f.id in goods:
        print 'good!', f.id
        continue
    else:
        f.purge()
        n += 1
        if n % 100 == 0:
            print n, f.id
            sleep(5)
