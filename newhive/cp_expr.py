# README:
# place appropriate db credentials in newhive/config/live_secret
# and delete immediately afterwards

#
# Recipes

# Copy expression off live server to local
# remote_db = dbs('live')
# remote_expr = remote_db.Expr.with_url('http://staging.newhive.com/newhive/faq?q=faq')
# cp_expr(remote_expr, db)

# Copy local expression to remote
# remote_db = dbs('dev')
# expr = db.Expr.last()
# cp_expr(expr, remote_db)

from pymongo.errors import DuplicateKeyError

from newhive import state

def cp_expr(expr, dest_db, overwrite=False, ctime=True, mtime=True):
    """ ctime and mtime preserve 'created' and 'updated' attributes instead
    of overwriting them with copy time """
    if overwrite:
        old_expr = dest_db.Expr.named(expr['owner_name'], expr['name'])
        if old_expr: old_expr.purge()
    new_expr = dest_db.Expr.new(expr)
    new_expr.pop('snapshot_id', None) # snapshot should be rerendered from dest
    new_expr.pop('snapshot_time', None)
    try:
        new_expr.create()
    except DuplicateKeyError:
        print('skipping copying existing expr ' + new_expr.url)
        return

    src_db = expr.db

    apps = new_expr.get('apps',[])
    # TODO-cleanup-background: make background an app, remove this
    bg = new_expr.get('background')
    if bg: apps.append(bg)

    # copy files to destination buckets
    for file_id in new_expr.get('file_id'):
        old_file = src_db.File.fetch(file_id)
        old_file['tmp_file'] = old_file.file
        old_file['resample_time'] = 0
        if old_file.has_key('resamples'):
            del old_file['resamples']
        try:
            new_file = dest_db.File.create(old_file)
            print('copying file ' + new_file['url'])
        except DuplicateKeyError:
            print('skipping copying existing file ' + file_id)
            new_file = dest_db.File.fetch(file_id)

        # update expr with new file
        for app in apps:
            if app.get('file_id') != file_id: continue
            app['url'] = new_file.get('url')

    apps.remove(bg)
    new_expr.save()

    # rejigger created and updated
    if ctime: new_expr.update(created=expr['created'], updated=False)
    if mtime: new_expr.update(updated=expr['updated'])

    return new_expr
