plain_port      = 80
ssl_port        = 443
server_name     = 'thenewhive.com'
database        = 'hive'
media_path      = '/home/domains/thenewhive.com'

aws_id          = False
aws_secret      = False
s3_buckets      = []

admins          = ['abram', 'andrew', 'cara', 'duffy', 'zach']
site_user       = 'thenewhive'
site_pages      = {
     'editor_help' : 'default-instructional'
    ,'welcome'     : 'welcome'
    }

email_server    = 'localhost'
email_user      = False
email_password  = False

use_ga          = False
signup_group    = 1

debug_mode      = False
debug_unsecure  = False
webassets_debug = False

from os.path import dirname
src_home        = dirname(__file__)

