from newhive import state
db = state.Database()
from newhive.utils import Apply

# in case migration repeatedly fails mysteriously
#while True:
#    try:
#        pending_truncate_indexed_words.migrate()
#    except:
#        print('failed again')
#        time.sleep(10)
#        continue
#    break

def migrate():
    return Apply.apply_continue(fixup, db.Expr, {})

def fixup(expr, dryrun=False):
    expr.build_search(expr)
    expr.update(text_index=expr.get('text_index', ''), updated=False)
    return True
