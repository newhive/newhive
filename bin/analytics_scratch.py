# exprs by user

expr_slice = [ (r['owner_name'], r['name'], r['created'])
    for r in db.Expr.search(mq().gt('created', now() - 86400*183)) ]

exprs_by_user = defaultdict(lambda: [])
for r in expr_slice: exprs_by_user[r[0]].append(r[1:])

users_sorted = sorted(exprs_by_user.items(), key=lambda r: len(r[1]),
    reverse=True)

expr_slice_sorted = []
for u in users_sorted:
    expr_slice_sorted.extend( [ (u[0], r[0], r[1]) for r in u[1] ] )

exprs_by_month = [
    [ (r['owner_name'], r['name'], r['created']) for r in
        db.Expr.search(mq().bt('created',
            now() - 86400*30*(n+1), now() - 86400*30*n))
    ] for n in range(6)
]

for slice in exprs_by_month:
    exprs_by_user = defaultdict(lambda: [])
    for r in slice: exprs_by_user[r[0]].append(r[1:])
    print( 'users: ', len(exprs_by_user), 'exprs: ', len(slice),
        'exprs/users: ', float(len(slice)) / len(exprs_by_user) )
