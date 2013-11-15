from newhive import state
db = state.Database()

def add_entity_owner(r):
    entity = r.entity
    if not r.entity:
        r.delete()
        return True
    r.update(entity_owner=r.entity.owner.id, updated=None)

def update_all_feed():
    count = 0
    for r in db.Feed.search({}): 
    	count += 1 if add_entity_owner(r) else 0
    print "%s items deleted" % count
