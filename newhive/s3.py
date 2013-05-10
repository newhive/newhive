import config

from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key

class S3Interface(object):
    def __init__(self):
        s3_con = S3Connection(config.aws_id, config.aws_secret)
        self.asset_bucket = s3_con.create_bucket(config.asset_bucket)
        
    def upload_file(self, filename, remote_filename=None):
        # Set remote name to local filename if not provided
        remote_filename = remote_filename or filename
        s3_url = "https://%s.s3.amazonaws.com/%s" % (config.asset_bucket,remote_filename)
        k = S3Key(self.asset_bucket)
        k.name = remote_filename
        k.set_contents_from_filename(filename)
        k.make_public()
        return s3_url