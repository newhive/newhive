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

    def delete_file(self, bucket, path):
        k = S3Key(self.buckets[bucket])
        k.name = path
        k.delete()

    def url(self, bucket='media', key=''):
        return ('https://' + self.buckets[bucket].name
            + '.s3.amazonaws.com/' + key)

    def file_exists(self, bucket, path):
        k = S3Key(self.buckets[bucket])
        k.name = path
        return k.exists()

    def upload_file(self, file, bucket, path, name=None, mimetype=None, ttl=False):
        if isinstance(file, basestring):
            file = open(file, 'r')
        else: file.seek(0)
        k = S3Key(self.buckets[bucket])
        k.name = path
        name_escaped = urllib.quote_plus(name.encode('utf8')) if name else path
        s3_headers = {
            'Content-Disposition': 'inline; filename=' + name_escaped,
            'Cache-Control': 'max-age=' + str(86400 * (ttl if ttl else 3650))
        }
        if mimetype: s3_headers['Content-Type'] = mimetype
        k.set_contents_from_file(file, headers=s3_headers)
        k.make_public()
        return k.generate_url(0, query_auth=False)

