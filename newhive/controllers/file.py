import hsaudiotag.auto
import urllib, urlparse, itertools, mimetypes, os, json
from werkzeug.http import parse_options_header
from newhive.controllers.controller import ModelController, auth_required
from PIL import Image

class File(ModelController):
    model_name = 'File'

    @auth_required
    def create(self, tdata, request, response, **args):
        """ Saves a file uploaded from the expression editor, responds
        with a Hive.App JSON object.
        """
        url = request.form.get('url')
        if url:
            try:
                file = urllib.urlopen(url)
            except:
                return {'error': 'remote url download failed'}
            if file.getcode() != 200:
                return {'error': 'remote url download failed with status %s' % (file.getcode())}
            mime = file.headers.getheader('Content-Type')
            filename = lget([i[1] for i in [i.split('=') for i in file.headers.get('content-disposition', '').split(';')] if i[0].strip() == 'filename'], 0)
            if filename:
                file.filename = filename + mimetypes.guess_extension(mime)
            else:
                file.filename = os.path.basename(urlparse.urlsplit(url).path)
            files = [file]
        else:
            request.max_content_length = 100000000 # max size 100MB
            files = itertools.chain.from_iterable(request.files.iterlistvalues())

        rv = []
        for file in files:
            if not file.filename: continue # ignore empty file inputs

            if hasattr(file, 'headers') and hasattr(file.headers, 'getheader'):
                mime = parse_options_header(file.headers.getheader('Content-Type'))[0]
            else:
                mime = mimetypes.guess_type(file.filename)[0]

            if not mime: mime = 'application/octet-stream'
            # media, subtype = mime.split('/')

            # Supported mime types.  First try to find exact match to full mime
            # type (e.g. text/html), then default to generic type (e.g. text).
            # If that doesn't exist either, treat as binary to link to
            supported_mimes = {
                'audio/mpeg': _handle_audio,
                'audio/mp4': _handle_audio,
                'image/gif': _handle_image,
                'image/jpeg': _handle_image,
                'image/png': _handle_image,
                'text/html': _handle_html,
                'application/javascript': _handle_js,
                'application': _handle_link,
                'text': _handle_link,
            }

            handler = supported_mimes.get(mime)
            if not handler: handler = supported_mimes.get(mime, _handle_link)

            print 'mime is ' + mime
            with os.tmpfile() as local_file:
                local_file.write(file.read())

                file_data = {'owner': tdata.user.id,
                    'tmp_file': local_file, 'name': file.filename, 'mime': mime}
                if url: file_data['source_url'] = url
                file_record = self.db.File.create(file_data)
                file_record.update(**handler(file_record, request.form))
                rv.append(file_record.client_view())
        return self.serve_json(response, rv)

    def resize(self, request, response, **args):
        # file_record = self.db.File.fetch(request.form.get('id'))
        # return _resize(file_record, request.form)
        pass

    def delete(self, request, response):
        res = self.db.File.fetch(request.form.get('id'))
        if res: res.delete()
        return True

def _handle_audio(file_record, args):
    track = hsaudiotag.auto.File(file_record.file)
    data = dict()
    for attr in ["artist", "album", "title", "year", "genre", "track",
        "comment", "duration", "bitrate"]:
            data[attr] = getattr(track, attr)
    return {'meta': data}

def _handle_image(file_record, args):
    if args.get('thumb'):
        thumb_file = file_record.set_thumb(222, 222)
        file_record.set_thumb(70, 70, file=thumb_file)
    return {}

def _handle_html(file_record, args):
    return {}

def _handle_js(file_record, args):
    return {}

def _handle_link(file_record, args):
    return  {}

# not sure what the point of this is
def _handle_unsupported(file_record, args):
    data = {'error': 'file type not supported'}
    if hasattr(file, 'url'): data['url'] = file.url
    data['filename'] = file.filename
    return data
