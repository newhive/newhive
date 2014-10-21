# exprs by user

expr_slice = [ (r['owner_name'], r['name'], r['created'])
    for r in db.Expr.search(mq().gt('created', now() - 86400*183)) ]

exprs_by_user = defaultdict(lambda: [])
for r in expr_slice: exprs_by_user[r[0]].append(r[1:])

users_sorted = sorted(exprs_by_user.items(), key=lambda r: len(r[1]),
    reverse=True)
