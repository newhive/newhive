import urllib
from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key
import newhive

class S3Interface(object):
    def __init__(self, config=None):
        config = self.config = config if config else newhive.config

        # initialize s3 connection
        if config.aws_id:
            self.con = S3Connection(config.aws_id, config.aws_secret)
            self.buckets = { k: self.con.create_bucket(v)
                for k, v in config.s3_buckets.items() }

    def upload_file(self, file, bucket, path, name=None, mimetype=None):
        k = S3Key(self.buckets[bucket])
        k.name = path
        name_escaped = urllib.quote_plus(name.encode('utf8')) if name else path
        s3_headers = {
            'Content-Disposition': 'inline; filename=' + name_escaped,
            'Cache-Control': 'max-age=' + str(86400 * 3650)
        }
        if mimetype: s3_headers['Content-Type'] = mimetype
        k.set_contents_from_file(file, headers=s3_headers)
        k.make_public()
        return k.generate_url(0, query_auth=False)
