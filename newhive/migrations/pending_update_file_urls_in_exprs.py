def replace_urls(s):
    s = s.replace('//d26s0ow2ajnmml.cloudfront.net', '//s.newhive.com')
    s = s.replace('//d1v8u1ev1s9e4n.cloudfront.net', '//media.tnh.me')
    return s

def repair_expr(expr, dryrun=False):
    updated = False

    apps = expr.get('apps', [])
    for app in apps:
        s1 = app.get('url', '')
        s2 = app.get('content', '')
        s1_new = replace_urls(s1)
        s2_new = replace_urls(s2)

        if s1 != s1_new or s2 != s2_new:
            app['url'] = s1_new
            app['content'] = s2_new
            updated = True

    if not dryrun and updated:
        expr.update(updated=False, apps=apps)
    
    return updated
