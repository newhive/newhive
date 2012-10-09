import copy
from newhive import state, config
from newhive.utils import now

milestones = copy.copy(config.milestones)
milestones.reverse()

db = state.Database(config)

def latest_milestone(num):
    for n in milestones:
        if num >= n: return n
    return 0

def migrate(expr):
    views = expr.get('views')
    if views:
        expr.update(milestones={str(latest_milestone(views)): 0}, updated=False)

def main(db):
    print "running migration: setting initial expression view milestones"
    t0 = now()
    for expr in db.Expr.search({}): migrate(expr)
    print "migration complete in {} seconds".format(now() - t0)
