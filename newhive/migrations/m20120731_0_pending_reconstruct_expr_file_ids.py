import re
from newhive import state, config
db = state.Database(config)

def update_exprs():
    for e in db.Expr.search({}): update(e)

def update(e):
    ids = e._match_id(e.get('thumb')) + e._collect_files(e).get('file_id', [])
    ids = list( set( ids ) )
    ids.sort()
    if not len(ids): return

    e.update( updated = False, file_id = ids )
