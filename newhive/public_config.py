
plain_port      = 80
ssl_port        = 443
server_name     = 'thenewhive.com'
database        = 'hive'
media_path      = '/home/domains/thenewhive.com'

ssl_ca          = False

aws_id          = False
aws_secret      = False
s3_buckets      = []

admins          = ['abram', 'andrew', 'cara', 'duffy', 'zach']
site_user       = 'thenewhive'
site_pages      = {
     'editor-help'  : 'default-instructional'
    ,'profile-help' : 'profile-help'
    ,'welcome'      : 'welcome'
    }

email_server    = 'localhost'
email_user      = False
email_password  = False

use_ga          = False
signup_group    = 1

debug_mode      = False
debug_unsecure  = False
webassets_debug = False

from os.path import dirname, join, normpath
src_home        = normpath(join(dirname(__file__), ".."))
