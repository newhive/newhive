import hsaudiotag.auto
import urllib, urlparse, itertools, mimetypes, os, json
from werkzeug.http import parse_options_header
from PIL import Image
import threading

from newhive import config
from newhive.utils import lget
from newhive.controllers.controller import ModelController, auth_required
from PIL import Image
import threading

class File(ModelController):
    model_name = 'File'

    def create(self, tdata, request, response, **args):
        """ Saves a file uploaded from the expression editor, responds
        with a JSON list of Hive.App objects.
        """

        url = request.form.get('url')
        if url:
            try:
                file = fetch_url(url)
            except:
                return {'error': 'remote url download failed'}
            if file.getcode() != 200:
                return { 'error': 'remote url download failed with status %s'
                    % file.getcode() }
            files = [file]
            mime = file.mime
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
            file.mime = mime

            file_record = create_file(tdata.user, file, url=url, args=request.form)
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

    def ssl_auth(self, tdata, request, response, **args):
        return self.serve_data(
            response,
            'text/plain',
            "CA50037867F98F3E42411D5E61DC426B34D466E19B84E6B61ECAC2E971D9866C comodoca.com 59f7701bdfcb5",
        )

def create_file(owner, file, url=None, args={}):
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
    handler = supported_mimes.get(file.mime, _handle_link)

    local_file = os.tmpfile()
    
    local_file.write(file.read())
    file_data = { 'owner': owner.id, 'tmp_file': local_file,
        'name': file.filename, 'mime': file.mime }
    if url: file_data['source_url'] = url
    file_record = owner.db.File.create(file_data)
    file_record.update(**handler(file_record, args))
    return file_record

# download URL, return file object with mime property
def fetch_url(url):
    file = urllib.urlopen(url)
    file.mime = file.headers.getheader('Content-Type')
    name = url.strip('/').split('/')[-1]
    if mimetypes.guess_type(name)[0] == None:
        name = name + mimetypes.guess_extension(file.mime)
    file.filename = name
    return file

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

    # Defer resampling to another machine
    if config.live_server:
        return { 'resample_time': 0 }

    # resample image by powers of root 2, until < 100 pixels
    # THIS MUST be done after synchronous thumb generation
    # to not create a conflict with the tmpfile descriptor
    t = threading.Thread(target=file_record.set_resamples)
    t.daemon = True
    t.start()

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
