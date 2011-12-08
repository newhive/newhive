from state import db, Expr

def random_seed_expression():
  exprs = Expr.search()
  for e in exprs:
    e.update(random=random.random(), updated=False)

db.expr.ensure_index('random')
