import re
import urllib
import os
from time import sleep

from newhive import state
from newhive.utils import now, time_u, lget
from newhive.server_session import db


broken_files = []
lost_files = []

def migrate():
    broken_files.extend( list(db.File.search({
        's3_bucket':{'$exists':True, '$not':re.compile(r's\d-thenewhive')}
    })) )

    for r in broken_files:                                                                            
        expr = lget(db.Expr.search({'file_id':r.id}), 0)
        if expr: r['expr'] = expr
        else: lost_files.append(r)

    # TODO: actual migration

def find_app_by_file(expr, file_id):
    #filter(expr.get('apps', [])
    pass

#def update_expr_file_id(expr):
#    expr.update(updated=False, file_id=expr._collect_files(expr))
#
#def apply_all_slow(func, cursor):
#    for i, r in enumerate(cursor):
#        func(r)
#        if not i % 100:
#            sleep(7)
#            print i, r.id
