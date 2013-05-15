import urllib
from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key
import newhive

class S3Interface(object):
    def __init__(self, config):
        config = self.config = config if config else newhive.config

        # initialize s3 connection
        if config.aws_id:
            self.con = S3Connection(config.aws_id, config.aws_secret)
            self.buckets = { k: self.con.create_bucket(v)
                for k, v in config.s3_buckets.items() }

    def upload_file(self, file, bucket, path, name=None, mimetype=None):
    def upload_file(self, filename, remote_filename=None, mimetype=None):
        # Set remote name to local filename if not provided
        remote_filename = remote_filename or filename
        k = S3Key(self.asset_bucket)
        k.name = remote_filename
        name_escaped = urllib.quote_plus(remote_filename.encode('utf8'))
        s3_headers = {
            'Content-Disposition': 'inline; filename=' + name_escaped,
            'Cache-Control': 'max-age=' + str(86400 * 3650)
        }
        if mimetype:
            s3_headers['Content-Type'] = mimetype
        k.set_contents_from_filename(filename)
        k.make_public()
        return k.generate_url(0, query_auth=False)




            b = self.db.con.get_bucket(self['s3_bucket'])
            k = S3Key(b)
            k.name = id
            name_escaped = urllib.quote_plus(name.encode('utf8'))
            k.set_contents_from_file(file, headers = {
                'Content-Disposition': 'inline; filename=' + name_escaped,
                'Content-Type' : self['mime'],
                'Cache-Control': 'max-age=' + str(86400 * 3650)
            })
            k.make_public()
            return k.generate_url(0, query_auth=False)

