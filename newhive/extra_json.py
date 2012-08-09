import datetime
import jinja2
from simplejson import JSONEncoder, dumps

class JSONEncoderForHTML(JSONEncoder):
    """An encoder that produces JSON safe to embed in HTML.

To embed JSON content in, say, a script tag on a web page, the
characters &, < and > should be escaped. They cannot be escaped
with the usual entities (e.g. &amp;) because they are not expanded
within <script> tags.
"""

    def encode(self, o):
        # Override JSONEncoder.encode because it has hacks for
        # performance that make things more complicated.
        chunks = self.iterencode(o, True)
        if self.ensure_ascii:
            return ''.join(chunks)
        else:
            return u''.join(chunks)

    def iterencode(self, o, _one_shot=False):
        chunks = super(JSONEncoderForHTML, self).iterencode(o, _one_shot)
        for chunk in chunks:
            chunk = chunk.replace('&', '\\u0026')
            chunk = chunk.replace('<', '\\u003c')
            chunk = chunk.replace('>', '\\u003e')
            yield chunk

class JSONEncoderExtra(JSONEncoderForHTML):
    def default(self, obj):
        if isinstance(obj, (datetime.date, datetime.datetime)):
            return obj.isoformat()
        elif isinstance(obj, jinja2.runtime.Undefined):
            return None
        else:
            return JSONEncoderForHTML.default(self, obj)

def extra_json(data):
    return dumps(data, cls=JSONEncoderExtra)
