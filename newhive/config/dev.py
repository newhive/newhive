from config_common import *

dev_prefix      = 'dev'

snapshot_async = False

# TODO-dev-security: move credentials into non-version-controlled file
database_host = 'mongodb://dev:2GlebTyo@dev.newhive.com/test'
database      = 'test'

aws_id     = 'AKIAJSU3W7EYEO4ZZCNA'
aws_secret = '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'
facebook_app_id        = '153421698080835'
facebook_client_secret = '53168c0305074b8ff82cab217d5043f9'
email_server    = 'smtp.sendgrid.net'
email_user      = 'thenewhive'
email_password  = 'fadty345shd90'
stripe_id = 'pk_test_cedS2baGtwNVnzyRbQzWitUB'
stripe_secret = 'sk_test_wdmhfxe3q493tHx0OP6mBZ9T'

s3_buckets = {
   'media': 'dev-1-s1-newhive',
   'thumb': 'dev-1-s2-newhive',
   'asset': 'dev-1-s0-newhive'
}
cloudfront_domains = {
    'media': 'd2pmwekhvitugk.cloudfront.net',
    'asset': None
}
