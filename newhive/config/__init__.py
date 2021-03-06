import re
from config_common import *
from config import *

def url_host(on_main_domain=True, port=None, secure=False):
    domain = server_name if on_main_domain else content_domain
    if domain.find('.' + server_name) > -1:
        (subdomain, domain) = domain.split('.', 1)
    if dev_prefix: domain = dev_prefix + '.' + domain
    ssl = secure # or always_secure ## no longer used
    port = ssl_port if ssl else plain_port
    port = '' if port == 80 or port == 443 else ':' + str(port)
    return domain if port == '' else domain + port

# TODO-cleanup: remove duplicate logic with url_host
# relative=True should be used everywhere possible
def abs_url(path='', secure=False, domain=None, subdomain=None, relative=False):
    """Returns absolute url for this server, like
       'https://lemur.office.newhive.com:1212/'.
       relative=True leaves out protocol """
    domain = domain or server_name
    if domain.find('.' + server_name) > -1:
        (subdomain, domain) = domain.split('.', 1)
    if dev_prefix: domain = dev_prefix + '.' + domain
    if relative:
        proto = ''
    else:
        proto = 'https:' if secure else 'http:'
    port = ssl_port if secure else plain_port
    port = '' if port == 80 or port == 443 else ':' + str(port)
    return (
        proto + '//' +
        (subdomain + '.' if subdomain else '') +
        domain + port + 
        '/' + re.sub('^/', '', path)
    )

def client_view():
	return dict(
        debug_mode=debug_mode,
        # use_strict=config.use_strict,
        use_ga=live_server,
	   	#streamified_url=streamified_url,
        #streamified_client_id=streamified_client_id,

        site_user=site_user,

        server_domain=(dev_prefix + '.' + server_name if 
            dev_prefix else server_name),
        server_url=abs_url(relative=True),
        secure_server=abs_url(secure=True),
        content_domain=(dev_prefix + '.' + content_domain if 
            dev_prefix else content_domain),
        content_url=abs_url(domain=content_domain, relative=True),
        secure_content_url=abs_url(domain=content_domain,secure=True),
        app=False,
        stripe_id=stripe_id
	)
