import re
from public_config import *
from private_config import *

with open('/etc/hostname') as f:
    hostname = f.read().strip()
dev_prefix, server_name = re.match('(.*?)\.?([^.]*\.[^.]{2,4})$', hostname).groups()

live_server = not dev_prefix
