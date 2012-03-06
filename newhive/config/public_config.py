
plain_port      = 80
ssl_port        = 443
server_name     = 'thenewhive.com'
database        = 'hive'
media_path      = '/home/domains/thenewhive.com'

ssl_ca          = False

aws_id          = False
aws_secret      = False
s3_buckets      = []

admins          = ['abram', 'andrew', 'cara', 'duffy', 'zach', 'jack']
admin_emails    = ['abram@thenewhive.com', 'andrew@thenewhive.com',
                   'cara@thenewhive.com', 'zach@thenewhive.com',
                   'duffy@thenewhive.com', 'info@thenewhive.com',
                   'duffy.tilleman@gmail.com', 'duffy@lumana.org',
                   'straussss@gmail.com', 'quuxman@gmail.com']
site_user       = 'thenewhive'
admins.append(site_user)
site_pages      = {
     'editor-help'  : 'default-instructional'
    ,'profile-help' : 'profile-help'
    ,'welcome'      : 'welcome'
    }

content_domain_prefix = 'user'

email_server    = 'localhost'
email_user      = False
email_password  = False

facebook_app_id = None
facebook_client_secret = None

use_ga          = False
signup_group    = 2

debug_mode      = False
debug_unsecure  = False
webassets_debug = False

from os.path import dirname, join, normpath
src_home        = normpath(join(dirname(__file__), "../.."))
