from newhive import state, config
db = state.Database(config)

for e in db.Expr.search({}, fields={'views':1, 'owner_views':1}):
    db.mdb.expr.update({'_id':e['_id']}, {'$set': {'views': e.get('views', 0) - e.get('owner_views', 0)}})
