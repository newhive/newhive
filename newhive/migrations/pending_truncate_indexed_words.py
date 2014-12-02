from newhive import state
db = state.Database()
from newhive.utils import Apply

def migrate():
    return Apply.apply_continue(fixup, db.Expr, {})

def fixup(expr, dryrun=False):
    expr.build_search(expr)
    expr.update(text_index=expr.get('text_index', ''), updated=False)
    return True
