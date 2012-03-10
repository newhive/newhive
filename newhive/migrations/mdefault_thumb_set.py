import state
from wsgi import *

def update_thumbs():
    ret = []
    for e in state.Expr.search(thumb={'$exists' : False }):
        fst_img = lget(filter(lambda a: a['type'] == 'hive.image', e.get('apps', [])), -1)
        if fst_img and fst_img.get('content'):
            e.update(updated=False, thumb=generate_thumb(state.User.fetch(e['owner']), fst_img['content']))
            ret.append(e)
    return ret
