from state import *
import config

def update_domain(old_name='thenewhive.com'):
    for e in Expr.search():
        e.update(updated=False, domain=re.sub(old_name, config.server_name, e['domain']))

    for u in User.search():
        u.update(updated=False, sites=[u['name'] + '.' + config.server_name])
