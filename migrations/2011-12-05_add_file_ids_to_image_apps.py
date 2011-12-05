from state import Expr
def add_file_ids_to_image_apps():
    exprs = Expr.search()
    for e in exprs:
        update = False
        if not e.get('apps'): break
        for app in e['apps']:
            if app.get('type') == 'hive.image':
                file_id = app.get('file_id')
                if not file_id:
                    file_id = app['content'].split('/')[-1]
                    app['file_id'] = file_id
                    updated = True
        if updated: e.update_cmd(e)
