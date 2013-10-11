import re
from newhive import state
db = state.Database()

def exprs_with_embeds():
    return db.Expr.search({'apps': {'$elemMatch': {
        'type': 'hive.html', 'content': re.compile(r'<object|<embed', re.I)}}})

def create_user(name):
	db.User.create({"name": name,
		"email":"me@somewhere.com",
		"password":"password",
		"referrer":db.User.site_user.id
		})
	new = db.User.named(name)
	nd = db.User.named("newduke")

def ids_from_urls(urls):
	return map(lambda x:db.Expr.with_url(x).id, urls)

def insert_tagged(user, tag, ids):
	assert type(ids)==list and type(tag)==str

	if not user.has_key('tagged'):
		user['tagged'] = {}
	user['tagged'][tag] = ids
	user.save(updated=False)
