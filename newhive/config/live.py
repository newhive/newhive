from .config_common import *

live_server     = True
dev_prefix      = None

debug_mode      = False
debug_unsecure  = False

database        = 'live'
server_name     = 'newhive.com'
content_domain  = 'tnh.me'


s3_buckets = {
    'media': 's1-thenewhive',
    'thumb': 'thumb-newhive',
    'asset': 'live-skin-newhive'
}

cloudfront_domains = {
    'media': 'd1v8u1ev1s9e4n.cloudfront.net',
    'asset': 'd26s0ow2ajnmml.cloudfront.net'
}

stripe_id = 'pk_test_cedS2baGtwNVnzyRbQzWitUB'
 
facebook_app_id = '153421698080835'
facebook_client_secret = '53168c0305074b8ff82cab217d5043f9'

email_server    = 'email-smtp.us-east-1.amazonaws.com'
email_user      = 'AKIAJLZKHMANRLNNJYVQ'
email_port      = 465

from live_secret import *
