# README:
# place appropriate db credentials in newhive/config/tmp_live_config
# if they are live credentials, delete immediately afterwards

from pymongo.errors import DuplicateKeyError

from newhive import state
from newhive.utils import MemoDict
import newhive.config.tmp_live_config as live_config
import newhive.config.stub_dev_config as dev_config
dbs = MemoDict({
    "live_db": lambda: state.Database(live_config)
    ,"dev_db": lambda: state.Database(dev_config) 
})
def cp_expr(expr, dest_db):
    new_expr = dest_db.Expr.new(expr)
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
    return new_expr