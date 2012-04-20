from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController
import urllib, urlparse, itertools

class FileController(ApplicationController):

    def create(self, request, response):
        """ Saves a file uploaded from the expression editor, responds
        with a Hive.App JSON object.
        """

        url = request.form.get('url')
        if request.form.get('remote') and url:
            try: file = urllib.urlopen(url)
            except: return {'error': 'remote url download failed'}
            if file.getcode() != 200: return {'error': 'remote url download failed with status %s' % (file.getcode())}
            mime = file.headers.getheader('Content-Type')
            filename = lget([i[1] for i in [i.split('=') for i in file.headers.get('content-disposition', '').split(';')] if i[0].strip() == 'filename'], 0)
            file.filename = filename + mimetypes.guess_extension(mime) if filename else os.path.basename(urlparse.urlsplit(url).path)
            files = [file]
        else:
            request.max_content_length = 100000000
            files = itertools.chain.from_iterable(request.files.iterlistvalues())

        rv = []
        for file in files:
            mime = mimetypes.guess_type(file.filename)[0]
            tmp_file = os.tmpfile()
            tmp_file.write(file.read())
            res = self.db.File.create(dict(owner=request.requester.id, tmp_file=tmp_file, name=file.filename, mime=mime))

            mime_category = mime.split('/')[0]

            # I'm not sure if this approach is very 'pythonic' but I'm 
            # having fun with a more functional approach in javascript
            # and I thought i'd bring it here too. Too bad python doesn't
            # have true anonymous functions --JDT
            data = {
                'audio': self._handle_audio
                , 'image': self._handle_image
            }.get(mime_category, lambda x: {})(res)

            data.update({ 'name': file.filename, 'mime' : mime, 'file_id' : res.id, 'url' : res.get('url')})
            rv.append(data)
            tmp_file.close()
        return rv

    def delete(self, request, response):
        res = self.db.File.fetch(request.form.get('id'))
        if res: res.delete()
        return True

    # "private" functions
    def _handle_audio(self, file):
        import hsaudiotag.auto
        track = hsaudiotag.auto.File(file.file)
        data = dict()
        for attr in ["artist", "album", "title", "year", "genre", "track", "comment", "duration", "bitrate", "size"]:
            data[attr] = getattr(track, attr)
        return {'type_specific': data}

    def _handle_image(self, file):
        return {'thumb': file.get_thumb(190,190)}
