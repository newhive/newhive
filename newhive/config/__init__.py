import re
from config_common import *
from config import *
import commands

if live_server:
    dev_prefix = None
else:
    hostname = commands.getoutput('hostname')
    dev_prefix, server_name = re.match('(.*?)\.?([^.]*\.[^.]{2,4})$', hostname).groups()
