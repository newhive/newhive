from newhive import state, config
db = state.Database(config)

for e in db.Feed.search({}):
    if e.entity: e.update(updated=False, entity_owner=e.entity.owner.id)
