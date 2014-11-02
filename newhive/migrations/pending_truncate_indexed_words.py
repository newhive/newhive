from newhive import state
db = state.Database()
from newhive.utils import Apply

def migrate():
    return Apply.apply_all(fixup, db.Expr.search({}))

def fixup(expr):
    expr.build_search(expr)
    expr.save()
    return True
