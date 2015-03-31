live_server     = False

plain_port      = 80
ssl_port        = 443
server_name     = 'newhive.com'
# dev_prefix is for accessing a particular server with a subdomain while the
# server behaves as if requests are made from server_name
dev_prefix      = None
database_host   = 'localhost'
database_port   = 27017
email_port      = 2525
media_path      = '/home/domains/thenewhive.com'
redirect_domains = ['newhive.com', 'thenewhive.com']
live_prefixes   = ['live-2', 'live-3', 'live-4', 'live-5', 'live-6']

analytics_db    = 'analytics'

google_api_key  = 'AIzaSyDwFDcABJN8ldQKGCA2ohiO8kHoFst57X8'
ssl_ca          = False

aws_id          = False
aws_secret      = False
s3_buckets = {
    'media': None,
    'system': None,
    'asset': None,
}
cloudfront_domains = {
    'media': None,
    'asset': None
}


################################################################
# constants
################################################################
cat_hover_count = 6
# use_strict = False

################################################################
# strings
################################################################
str_expression  = 'newhive'

################################################################
admins          = ['abram', 'cara', 'zach', 'newduke', 'fatsycline','root','newhive']

default_email_subscriptions = ['love', 'listen', 'share_expr', 'comment', 'broadcast', 'featured', 'milestone']
milestones = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
              20000, 50000, 100000, 200000, 500000, 1000000, 10000000]

devs = [ 'newduke', 'abram', 'spiffeh', 'nd4' ]

beta_testers = admins + [
    'andrew'
    ,'darkluna'
    ,'philco'
    ,'lolo'
    ,'roseanna'
    ,'anniesarah'
    ,'graham'
    ,'coo'
    ,'ashley'
    ,'ece'
    ,'sammie'
    ,'kaz'
    ,'v908'
    ,'test'
]

user_groups = { 'logged_in':set([]), 'logged_out':set(['logged_out']), 'all':set([]), 
    'admins':set(admins), 'beta_testers':set(beta_testers), 'devs':set(devs) }

site_user = 'newhive'
admins.append(site_user)

content_domain = 'tnh.me'

email_server    = 'localhost'
email_user      = False
email_password  = False

facebook_app_id = ''
facebook_client_secret = ''

#streamified_client_id = 'pjzkv2y4twdsutl3n0mkv1yajv1y5y3e'
#streamified_client_secret = ''
#streamified_networks = ['twitter']
#streamified_url = 'https://streamified.me/api/'

signup_group    = 2

debug_mode      = False
debug_unsecure  = False
webassets_debug = False
always_secure   = False
threaded_dev_server = False
snapshot_async = True

interactive = False

initial_invite_count = 5

from os.path import dirname, join, normpath, abspath
src_home = normpath(abspath(join(dirname(__file__), "../..")))

import json
with open(join(src_home, 'newhive/config/site_flags.json')) as f:
    site_flags = json.load(f)
