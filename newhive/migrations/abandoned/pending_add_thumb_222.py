from newhive import state
db = state.Database()

def update_all_users():
    for u in db.User.search({}): new_thumb(u)

def new_thumb(u):
    thumb_id = u.get('thumb_file_id')
    f = db.File.fetch(thumb_id)
    if not f: return # bail. # TODO: fall back to 'profile_thumb' url key
    thumb_file = f.set_thumb(222, 222)
    f.set_thumb(70, 70, thumb_file)
