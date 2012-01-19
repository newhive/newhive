from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController

class FileController(ApplicationController):

    def create(self, request, response):
        """ Saves a file uploaded from the expression editor, responds
        with a Hive.App JSON object.
        Resamples images to 1600x1000 or smaller, sets JPEG quality to 70
        """

        request.max_content_length = 100000000

        # TODO: separate image optimization from file upload logic
        for file_name in request.files:
            file = request.files[file_name]
            mime = mimetypes.guess_type(file.filename)[0]

            app = {}
            if mime == 'text/plain':
                app['type'] = 'hive.text'
                app['content'] = file.stream.read()
                return app

            tmp_file = os.tmpfile()
            file.save(tmp_file)
            res = self.db.File.create(owner=request.requester.id, tmp_file=tmp_file, name=file.filename, mime=mime)
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



