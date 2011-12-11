from state import Expr, File
import os, re, urllib

def add_file_ids_to_image_apps(e):
    updated = False
    if not e.get('apps'): return
    for app in e['apps']:
        if app.get('type') == 'hive.image':
            file_id = app.get('file_id')
            if re.match('https?://thenewhive.com/file', app['content']):
                if not file_id: file_id = app['content'].split('/')[-1]
                old_file = File.fetch(file_id)
                print 'uploading: ' + old_file['fs_path']
                if not os.path.isfile(old_file['fs_path']):
                    print "original file does not exist"
                    continue
                tmp_file = open(old_file['fs_path'])
                try:
                    res = File.create(owner=e['owner'], tmp_file=tmp_file, name=old_file['name'], mime=old_file['mime'])
                except: print "file creation fail"; continue
                app['content'] = res['url']
                app['file_id'] = res.id
            elif re.match('https?://..-thenewhive.s3.amazonaws.com', app['content']):
                if not file_id: file_id = app['content'].split('/')[-1]
                file = File.fetch(file_id)
                if not file: print "file id " + file_id + " not found"; continue
                print 'checking thumbnails for file ' + file_id
                try:
                    if (not file.get('thumbs')) or (not file['thumbs'].get('190x190')):
                        thumb190 = file.set_thumb(190,190)['file']
                        file.set_thumb(70,70, file=thumb190)
                    if (not file.get('thumbs')) or (not file['thumbs'].get('124x96')):
                        file.set_thumb(124,96)
                    file.save()
                except: print "something went wrong with thumbnail generation"
                app['file_id'] = file_id
            else:
                print 'fetching: ' + app['content']
                try: response = urllib.urlopen(app['content'])
                except:
                    print 'urlopen fail: ' + app['content']
                    continue
                if response.getcode() != 200:
                    print 'http fail ' + str(response.getcode()) + ': ' + app['content']
                    continue
                mime = response.headers.getheader('Content-Type')
                tmp_file = os.tmpfile()
                tmp_file.write(response.read())
                tmp_file.seek(0)
                res = File.create(owner=e['owner'], tmp_file=tmp_file, name=app['content'].split('/')[-1], mime=mime)
                app['content'] = res['url']
                app['file_id'] = res.id
            updated = True
    if updated: e.update_cmd(e)

def update_all_exprs():
    for e in Expr.search(apps={'$exists': True}):
      print;
      print e.url;
      add_file_ids_to_image_apps(e)
