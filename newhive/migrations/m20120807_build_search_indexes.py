from newhive.utils import *
from newhive import state, config
db = state.Database(config)

def build_search(r):
    print 'updating ' + r.id
    upd = dfilter(r, ['fullname', 'name', 'tags', 'title', 'apps'])
    r.build_search(upd)
    upd['updated'] = False
    r.update(**upd)

def update_all_expr():
    for r in db.Expr.search({}): build_search(r)

def update_all_user():
    for r in db.User.search({}): build_search(r)
