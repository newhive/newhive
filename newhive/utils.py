import time, random, re
from datetime import datetime
from newhive import config

def now(): return time.time()

def time_s(t): return int(t.strftime('%s'))

def time_u(t): return datetime.utcfromtimestamp(t)

def junkstr(length):
    """Creates a random base 64 string"""

    def chrange(c1, c2): return [chr(i) for i in range(ord(c1), ord(c2)+1)]
    chrs = chrange('0', '9') + chrange('A', 'Z') + chrange('a', 'z') + ['.', '/']
    return ''.join([chrs[random.randrange(0, 64)] for _ in range(length)])

def normalize(ws):
    return filter(lambda s: re.match('\w', s), re.split('\W', ws.lower()))

def abs_url(secure = False, domain = None, subdomain = None):
    """Returns absolute url for this server, like 'https://thenewhive.com:1313/' """

    proto = 'https' if secure else 'http'
    port = config.ssl_port if secure else config.plain_port
    port = '' if port == 80 or port == 443 else ':' + str(port)
    return (proto + '://' + (subdomain + '.' if subdomain else '') +
        (domain or config.server_name) + port + '/')
