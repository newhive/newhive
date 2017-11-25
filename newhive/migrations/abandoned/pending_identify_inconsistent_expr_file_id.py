from newhive.db_tools import *

funky_exprs = []

def check_expr(r):
    files = r.get('file_id', [])[:]
    r._collect_files(r)
    if files != r.get('file_id', []):
        funky_exprs.append(r)

for r in funky_exprs:
    print r.url()