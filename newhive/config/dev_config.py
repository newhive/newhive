database_host   = '127.0.0.1'
database        = 'test'

plain_port      = 1212
ssl_port        = 1213
debug_mode      = True
debug_unsecure  = True

# Uncomment to run as live server
# sudo service apache2 restart
# plain_port      = 80
# ssl_port        = 443
# debug_mode      = False

server_name     = 'office.newhive.com'
content_domain  = 'office.tnh.me'
dev_prefix      = None

aws_id          = 'AKIAJSU3W7EYEO4ZZCNA'
aws_secret      = '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'
s3_buckets = {
   'media': 'dev-1-s1-newhive',
   'thumb': 'dev-1-s2-newhive',
   'asset': 'dev-1-s0-newhive'
}
cloudfront_domains = {
    'media': 'd2pmwekhvitugk.cloudfront.net',
    'asset': None
}
 
debug_unsecure  = True

facebook_app_id = '153421698080835'
facebook_client_secret = '53168c0305074b8ff82cab217d5043f9'

email_server    = 'smtp.sendgrid.net'
email_user      = 'thenewhive'
email_password  = 'fadty345shd90'
#email_port      = 2525

#beta_testers = admins          = ['abram', 'andrew', 'cara', 'duffy', 'zach', 'jack', 'fred', 'newduke']
