import urllib
from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key
import newhive
from newhive import config
import re
from google.cloud.storage.client import Client
from base64 import b16decode, b64encode


class S3Interface(object):
    def __init__(self, config=None):
        config = self.config = config if config else newhive.config

        # initialize s3 connection
        if config.aws_id:
            self.con = S3Connection(config.aws_id, config.aws_secret)
            self.buckets = { k: self.con.get_bucket(v)
                for k, v in config.s3_buckets.items() }

    def delete_file(self, bucket, path):
        bucket = self.buckets.get(bucket) or self.con.get_bucket(bucket)
        k = bucket.get_key(path)
        if k:
            k.delete()
            return True
        return False

    def url(self, bucket='media', key='', bucket_name=None, http=False, secure=False):
        url = self.bucket_url(bucket, bucket_name) + key
        if http: url = 'http' + url
        if secure: url = 'https' + url
        return url

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
        return self.url(bucket, path)

    def bucket_url(self, bucket='media', bucket_name=None):
        return '//' + ( self.config.cloudfront_domains.get(bucket) or (
            (bucket_name or self.config.s3_buckets[bucket])
            + '.s3.amazonaws.com') ) + '/'


class GoogleStorage(object):
    def __init__(self, config=None):
        self.config = config if config else newhive.config

        # initialize s3 connection
        if self.config.buckets:
            self.con = Client()
            self.buckets = {
                k: self.con.get_bucket(name) for
                k, name in self.config.buckets.items()
            }

    def upload_file(self, file, bucket_name, path, name, mimetype, md5=None):
        bucket = self.buckets[bucket_name]
        remote = bucket.blob(path)
        if mimetype:
            remote.content_type = mimetype
        remote.cache_control = 'max-age=' + str(86400 * 3650)
        if md5:
            remote.md5_hash = b64encode(b16decode(md5.upper()))

        if isinstance(file, basestring):
            remote.upload_from_filename(file)
        else:
            file.seek(0)
            remote.upload_from_file(file, num_retries=3)
        return self.url(bucket_name, path)

    def delete_file(self, bucket, path):
        bucket = self.buckets[bucket]
        remote = bucket.blob(path)
        if remote.exists():
            remote.delete()
            return True
        return False

    def file_exists(self, bucket, path):
        bucket = self.buckets[bucket]
        remote = bucket.blob(path)
        return remote.exists()

    def bucket_url(self, bucket='media'):
        return '//' + self.config.buckets[bucket] + '/'

    def url(self, bucket='media', key='', bucket_name=None, http=False, secure=False):
        url = self.bucket_url(bucket) + key
        if http: url = 'http' + url
        if secure: url = 'https' + url
        return url
