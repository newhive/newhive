from newhive.server_session import db
from newhive.mongo_helpers import mq
from newhive.db_tools import dbs
from pymongo.errors import DuplicateKeyError

count = 0
counts = {}

def merge_db(config_name, do_write=False):
    db_remote = dbs(config_name)
    
    remotes = db_remote.mdb.collection_names()
    for cn in db.mdb.collection_names():
        if cn in remotes:
            merge_collection(db_remote, cn, do_write)
    print counts

def merge_collection(db_remote, cn, do_write=False):
    remote = db_remote.mdb[cn]
    local = db.mdb[cn]

    # determine sort key depending on if index for "updated" field exists 
    sort_attr = 'updated' if True in [index['key'][0][0] == 'updated' for
        index in remote.index_information().values()] else '_id'
    newest_local = local.find().sort(sort_attr, -1).limit(1)[0]
    cur = remote.find( mq().gt(sort_attr, newest_local[sort_attr])
        ).sort(sort_attr, 1)

    print 'merging %d records from %s' % (cur.count(), cn)
    if not do_write: return

    count = 0
    for r in cur:
        local.update({'_id': r['_id']}, r, True)
        #except DuplicateKeyError:
        #    print r['_id'], 'duplicate!! shits'
        if not count % 100: print r[sort_attr]
        count += 1
    print 'finished merging %d records from %s' % (count, cn)
    counts[cn] = count
