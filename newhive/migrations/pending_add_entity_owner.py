from newhive import state
db = state.Database()

def add_entity_owner(r):
    entity = r.entity
    if not r.entity:
        r.delete()
        return
    r.update(entity_owner=r.entity.owner.id, updated=None)

def update_all_feed():
    for r in db.Feed.search({}): add_entity_owner(r)
