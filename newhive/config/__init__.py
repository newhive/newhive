import re
from config_common import *
from config import *

def client_view():
	return dict(
	   	streamified_url=streamified_url,
        streamified_client_id=streamified_client_id,
        content_domain=content_domain,
	)