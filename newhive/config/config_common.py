live_server     = False

plain_port      = 80
ssl_port        = 443
server_name     = 'newhive.com'
dev_prefix      = None
database_host   = 'localhost'
database_port   = 27017
email_port      = 2525
media_path      = '/home/domains/thenewhive.com'
redirect_domains = ['newhive.com', 'thenewhive.com']

analytics_db    = 'analytics'

ssl_ca          = False

aws_id          = False
aws_secret      = False
s3_buckets = {
    'media': None,
    'system': None,
    'assets': None,
}

admins          = ['abram', 'cara', 'zach', 'newduke', 'fatsycline']

default_email_subscriptions = ['love', 'listen', 'share_expr', 'comment', 'broadcast', 'featured', 'milestone']
milestones = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
              20000, 50000, 100000, 200000, 500000, 1000000, 10000000]

beta_testers = admins + [
    'andrew'
    'darkluna'
    'philco'
    'lolo'
    'roseanna'
    'anniesarah'
    'graham'
    'coo'
    'ashley'
    'ece'
    'sammie'
    'kaz'
    'v908'
    'test'
]

site_user = 'newhive'
admins.append(site_user)

content_domain = 'tnh.me'

email_server    = 'localhost'
email_user      = False
email_password  = False

facebook_app_id = ''
facebook_client_secret = ''

streamified_client_id = 'pjzkv2y4twdsutl3n0mkv1yajv1y5y3e'
streamified_client_secret = ''
streamified_networks = ['twitter']
streamified_url = 'https://streamified.me/api/'

signup_group    = 2

debug_mode      = False
debug_unsecure  = False
webassets_debug = False
always_secure   = False

interactive = False

initial_invite_count = 5

from os.path import dirname, join, normpath
src_home = normpath(join(dirname(__file__), "../.."))