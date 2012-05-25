
plain_port      = 80
ssl_port        = 443
server_name     = 'thenewhive.com'
database        = 'hive'
database_host   = 'localhost'
database_port   = 27017
email_port      = 2525
media_path      = '/home/domains/thenewhive.com'
dev_prefix      = None

ssl_ca          = False

aws_id          = False
aws_secret      = False
s3_buckets      = []
asset_bucket    = None

admins          = ['abram', 'andrew', 'cara', 'duffy', 'zach', 'jack']
admin_emails    = ['abram@thenewhive.com', 'andrew@thenewhive.com',
                   'cara@thenewhive.com', 'zach@thenewhive.com',
                   'duffy@thenewhive.com', 'info@thenewhive.com',
                   'duffy.tilleman@gmail.com', 'duffy@lumana.org',
                   'straussss@gmail.com', 'quuxman@gmail.com']

beta_testers    = [
                   'darkluna'
                  , 'philco'
                  , 'lolo'
                  , 'roseanna'
                  , 'anniesarah'
                  , 'graham'
                  , 'coo'
                  , 'ashley'
                  , 'ece'
                  , 'sammie'
                  , 'kaz'
                  , 'v908'
                  , 'test'
                  ]
beta_testers = admins + beta_testers

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

facebook_app_id = ''
facebook_client_secret = ''

use_ga          = False
signup_group    = 2

debug_mode      = False
debug_unsecure  = False
webassets_debug = False
always_ssl      = False

from os.path import dirname, join, normpath
src_home        = normpath(join(dirname(__file__), "../.."))
