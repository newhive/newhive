from newhive import state
db = state.Database()
from newhive.utils import Apply
from newhive.mongo_helpers import mq

# in case migration repeatedly fails mysteriously
#while True:
#    try:
#        pending_truncate_indexed_words.migrate()
#    except:
#        print('failed again')
#        time.sleep(10)
#        continue
#    break

def migrate_exprs():
    return Apply.apply_continue(fixup_exprs, db.Expr, {})
def migrate_users():
    return Apply.apply_continue(fixup_users, db.User, {})
def migrate_exprs_name():
    return Apply.apply_continue(expr_name, db.Expr, mq().js('this.name.length > 80'))

def fixup_exprs(expr, dryrun=False):
    expr.build_search(expr)
    expr.update(text_index=expr.get('text_index', ''), updated=False)
    return True

def expr_name(expr, dryrun=False):
    expr.update(name=db.Expr.unused_name(expr.owner, expr['name'][0:80]),
        updated=False)
    return True

def fixup_users(r, dryrun=False):
    r.build_search(r)
    r.update(text_index=r.get('text_index', ''), updated=False)
    return True
