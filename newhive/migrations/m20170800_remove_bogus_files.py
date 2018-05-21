from __future__ import print_function
from itertools import imap, repeat

def map_status(fn, iter, interval=1000, report=lambda n, r: n):
    n = 0
    for i in iter:
        if not n % interval: print(report(n, i))
        n += 1
        yield fn(i)
    if n:
        print(report(n, i))
#        return report(n, i)

def get_exprs(limit=2000):
    page_index = ''
    exprs = []
    while True:
        batch = list(db.Expr.mq().gt('_id', page_index
            )().sort('_id', 1).limit(limit))
        exprs.extend(batch)
        print(len(exprs), page_index)
        if len(batch) < limit: break
        page_index = batch[-1]['_id']
    return exprs
