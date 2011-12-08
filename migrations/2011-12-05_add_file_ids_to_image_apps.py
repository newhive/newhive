from state import Expr, File
import os, re, urllib

def add_file_ids_to_image_apps(e):
    updated = False
    if not e.get('apps'): return
    for app in e['apps']:
        if app.get('type') == 'hive.image':
            file_id = app.get('file_id')
            if not file_id or re.match('https?://thenewhive.com/file', app['content']):
                print 'updating: ' + e.id
                if re.match('https?://thenewhive.com/file', app['content']):
                    file_id = app['content'].split('/')[-1]
                    old_file = File.fetch(file_id)
                    print 'uploading: ' + old_file['fs_path']
                    res = File.create(owner=e['owner'], path=old_file['fs_path'], name=old_file['name'], mime=old_file['mime'])
                    app['content'] = res['url']
                    app['file_id'] = res.id
                elif re.match('https?://..-thenewhive.s3.amazonaws.com', app['content']):
                    file_id = app['content'].split('/')[-1]
                    app['file_id'] = file_id
                else:
                    print 'fetching: ' + app['content']
                    try: response = urllib.urlopen(app['content'])
                    except:
                        print 'urlopen fail: ' + app['content']
                        return
                    if response.getcode() != 200:
                        print 'http fail ' + str(response.getcode()) + ': ' + app['content']
                        return
                    mime = response.headers.getheader('Content-Type')
                    path = os.tmpnam()
                    f = open(path, 'w')
                    f.write(response.read())
                    f.close()
                    res = File.create(owner=e['owner'], path=path, name=app['content'].split('/')[-1], mime=mime)
                    app['content'] = res['url']
                    app['file_id'] = res.id
                updated = True
    if updated: e.update_cmd(e)

def update_all_exprs():
    for e in Expr.search(): add_file_ids_to_image_apps(e)
