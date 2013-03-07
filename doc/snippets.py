cleaned_exprs = [dfilter(r, ['_id', 'name', 'owner_name', 'title', 'tags', 'text_index'])
	for r in db.Expr.search({'auth':'public'})]

# expression dump for meta-data analysis
exprs = {}
for r in db.Expr.search({'auth':'public'}):
	r['likers'] = []
	exprs[r.id] = r
for r in db.Feed.search({'$or': [{'class_name':'Broadcast'}, {'class_name':'Star'}], 'entity_class':'Expr'}):
    id = r['entity']
    exprs.get(id, {}).get('likers', []).append(r['initiator'])
import json
f = open('/tmp/exprs.json', 'w')
json.dump(exprs, f, indent=0)
f.close()