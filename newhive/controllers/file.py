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
            try:
                file = urllib.urlopen(url)
            except:
                return {'error': 'remote url download failed'}
            if file.getcode() != 200:
                return {'error': 'remote url download failed with status %s' % (file.getcode())}
            mime = file.headers.getheader('Content-Type')
            print mimetypes.guess_extension(mime)
            filename = lget([i[1] for i in [i.split('=') for i in file.headers.get('content-disposition', '').split(';')] if i[0].strip() == 'filename'], 0)
            file.filename = filename + mimetypes.guess_extension(mime) if filename else os.path.basename(urlparse.urlsplit(url).path)
            files = [file]
        else:
            request.max_content_length = 100000000
            files = itertools.chain.from_iterable(request.files.iterlistvalues())

        rv = []
        for file in files:
            if hasattr(file, 'headers') and hasattr(file.headers, 'getheader'):
                mime = file.headers.getheader('Content-Type')
            else:
                mime = mimetypes.guess_type(file.filename)[0]

            print "MIME: {}".format(mime)

            type, subtype = mime.split('/')

            # Supported mime types.  First try to find exact match to full mime
            # type (e.g. text/html), then default to generic type (e.g. text).
            # If that doesn't exist either alert the client that the type is
            # unsupported
            supported_mimes = {
                    'audio/mpeg': self._handle_audio
                    , 'audio/mp4': self._handle_audio
                    , 'image/gif': self._handle_image
                    , 'image/jpeg': self._handle_image
                    , 'image/png': self._handle_image
                    , 'application': self._handle_link
                    , 'text/html': self._handle_frame
                    , 'text': self._handle_link
                    }

            handler = supported_mimes.get(mime)
            if not handler: handler = supported_mimes.get(type, self._handle_unsupported)

            with os.tmpfile() as local_file:
                local_file.write(file.read())

                file_record = self.db.File.create({'owner': request.requester.id, 'tmp_file': local_file, 'name': file.filename, 'mime': mime})
                data = handler(file, local_file, file_record, mime)

                data.update({'mime': mime, 'name': file.filename, 'file_id': file_record.id, 'url': file_record.get('url')})
                rv.append(data)

            # I'm not sure if this approach is very 'pythonic' but I'm 
            # having fun with a more functional approach in javascript
            # and I thought i'd bring it here too. Too bad python doesn't
            # have true anonymous functions --JDT
            #file, data = {
            #    'audio': self._handle_audio
            #    , 'image': self._handle_image
            #    , 'text': self._handle_text
            #}.get(mime_category, lambda x: {})(file, mime_subcategory)
            #tmp_file.close()

            #data.update({'mime' : mime})
            #rv.append(data)
        return rv

    def delete(self, request, response):
        res = self.db.File.fetch(request.form.get('id'))
        if res: res.delete()
        return True

    # "private" functions
    def _upload(self, file, local_file, owner):
        return (file_record, {'name': file.filename, 'file_id': res.id, 'url': res.get('url')})

    def _handle_audio(self, file, local_file, file_record, mime):
        import hsaudiotag.auto
        #file_record, data = self._upload(file, local_file, owner)
        track = hsaudiotag.auto.File(local_file)
        data = dict()
        for attr in ["artist", "album", "title", "year", "genre", "track", "comment", "duration", "bitrate", "size"]:
            data[attr] = getattr(track, attr)
        return {'type_specific': data}

    def _handle_image(self, file, local_file, file_record, mime):
        #file_record, data = self._upload(file, local_file, owner)
        #data.update({'thumb': file_record.get_thumb(190,190)})
        #return data
        return {'thumb': file_record.get_thumb(190,190)}

    def _handle_frame(self, file, local_file, file_record, mime):
        return {'iframe': True, 'original_url': file.url if hasattr(file, 'url') else ''}

    def _handle_text(self, file, local_file, file_record, mime):
        if mime == "html":
            pass

    def _handle_link(self, file, local_file, file_record, mime):
        pass

    def _handle_unsupported(self, file, local_file, file_record, mime):
        data = {'error': 'file type not supported'}
        if hasattr(file, 'url'): data['url'] = file.url
        data['filename'] = file.filename
        return data

