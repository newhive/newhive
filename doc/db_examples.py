import re
from newhive import state
db = state.Database()
from newhive.utils import now, time_u

# A couple handy defaults
nd = db.User.named('newduke')
e1 = db.Expr.with_url('newduke/index')

def recent_exprs(within_secs):
	return db.Expr.search({'updated': {'$gt': now() - within_secs}})

def new_exprs(within_secs):
	return db.Expr.search({'created': {'$gt': now() - within_secs}})

def name(entity):
	if type(entity) == list:
		return names(entity)
	if type(entity) == state.Cursor:
		return names(list(entity))
	res = ''
	if entity.has_key('owner_name'):
		res = entity['owner_name'] + '/'
	return res + entity['name']

def names(entity_list):
	return map(name, entity_list)

def exprs_with_embeds():
    return db.Expr.search({'apps': {'$elemMatch': {
        'type': 'hive.html', 'content': re.compile(r'<object|<embed', re.I)}}})

def exprs_with_jplayer():
    return db.Expr.search({'apps': {'$elemMatch': {
    	'content': re.compile(r'jplayer', re.I)}}})

def create_user(name):
	db.User.create({"name": name,
		"email":"me@somewhere.com",
		"sites":[name + ".thenewhive.com"],
		"password":"password",
		"referrer":db.User.site_user.id
		})
	return db.User.named(name)
	# new = db.User.named(name)
	# nd = db.User.named("newduke")

def ids_from_urls(urls):
	return map(lambda x:db.Expr.with_url(x).id, urls)

def insert_tagged(user, tag, ids):
	assert type(ids)==list and type(tag)==str

	if not user.has_key('tagged'):
		user['tagged'] = {}
	user['tagged'][tag] = ids
	user.save(updated=False)

# Get a referall URL from a particular user
def new_referral_link(from_user_name, to_email='', reuse=1):
	return str(new_referral(
		from_user_name=from_user_name, to_email=to_email, reuse=reuse).url)
def new_referral(from_user_name, to_email='', reuse=1):
	return db.User.named(from_user_name).new_referral(
		{'to': to_email, 'reuse': reuse})

