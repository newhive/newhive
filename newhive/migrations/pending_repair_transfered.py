def repair_expr(expr, dryrun=False):
    updated = False

    apps = expr.get('apps', [])
    for app in apps:
        file_id = (
            expr._match_id(app.get('content')) or
            expr._match_id(app.get('url'))
        )
        if file_id and app.get('file_id') != file_id:
            updated = True
            app['file_id'] = file_id[0]

    if not dryrun and updated:
        expr.update(updated=False, apps=apps)
    
    return updated
