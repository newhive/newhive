from .dev import *

server_name     = 'site'
content_domain  = 'content'
# server_name     = 'wirbu.office.newhive.com'
# content_domain  = 'wirbu.office.tnh.me'

plain_port      = 1212
ssl_port        = 1213
database_host   = 'localhost'
database        = 'test'

debug_mode      = True
debug_unsecure  = True

# TODO?: reimplement local file upload
# aws_id = False # disable S3 connection for dev without Internet

cloudfront_domains = {
    'media': None
   ,'asset': None
}
