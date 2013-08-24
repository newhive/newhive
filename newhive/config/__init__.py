import re
from public_config import *
from private_config import *

if live_server:
    dev_prefix = None
else:
    with open('/etc/hostname') as f:
        hostname = f.read().strip()
    dev_prefix, server_name = re.match('(.*?)\.?([^.]*\.[^.]{2,4})$', hostname).groups()
