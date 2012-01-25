from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
import urllib

class FileController(ApplicationController):

    def create(self, request, response):
        """ Saves a file uploaded from the expression editor, responds
        with a Hive.App JSON object.
        """

        if request.form.get('remote') and request.form.get('url'):
            try: file = urllib.urlopen(request.form.get('url'))
            except: return {'err': 'remote url download failed'}
            if file.getcode() != 200: return {'err': 'remote url download failed with status %s' % (file.getcode())}
            file.filename = request.form.get('filename')
            mime = file.headers.getheader('Content-Type')
        else:
            request.max_content_length = 100000000
            file = request.files.items()[0][1]
            mime = mimetypes.guess_type(file.filename)[0]
        app = {}

        if mime == 'text/plain':
            app['type'] = 'hive.text'
            app['content'] = file.stream.read()
            return app

        tmp_file = os.tmpfile()
        tmp_file.write(file.read())
        res = self.db.File.create(dict(owner=request.requester.id, tmp_file=tmp_file, name=file.filename, mime=mime))
        tmp_file.close()
        url = res.get('url')
        app['file_id'] = res.id

        if mime in ['image/jpeg', 'image/png', 'image/gif']:
            app['type'] = 'hive.image'
            app['content'] = url
        elif mime == 'audio/mpeg':
            app['content'] = ("<object type='application/x-shockwave-flash' data='/lib/player.swf' width='100%' height='24'>"
                +"<param name='FlashVars' value='soundFile=" + url + "'>"
                +"<param name='wmode' value='transparent'></object>"
                )
            app['type'] = 'hive.html'
            app['dimensions'] = [200, 24]
        else:
            app['type'] = 'hive.text'
            app['content'] = "<a href='%s'>%s</a>" % (url, file.filename)

        return app

    def delete(self, request, response):
        res = self.db.File.fetch(request.form.get('id'))
        if res: res.delete()
        return True



