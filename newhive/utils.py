import time, random, re, base64
from datetime import datetime
from newhive import config


def lget(L, i, *default):
    try: return L[i]
    except: return default[0] if default else None
def lset(L, i, e, *default):
    default = default[0] if default else [None]
    if i < len(L): L[i] = e
    else: L.extend(default * (i - len(L)) + [e])
def index_of(L, f):
    for i, e in enumerate(L):
        if f(e): return i
    return -1

def dfilter(d, keys):
    """ Accepts dictionary and list of keys, returns a new dictionary
        with only the keys given """
    r = {}
    for k in keys:
        if k in d: r[k] = d[k]
    return r


def now(): return time.time()

def time_s(t):
    return int(t.strftime('%s')) if (type(t) == datetime) else t

def time_u(t): return datetime.utcfromtimestamp(t)

def junkstr(length):
    """Creates a random base 64 string"""

    def chrange(c1, c2): return [chr(i) for i in range(ord(c1), ord(c2)+1)]
    chrs = chrange('0', '9') + chrange('A', 'Z') + chrange('a', 'z') + ['.', '/']
    return ''.join([chrs[random.randrange(0, 64)] for _ in range(length)])

def lget(L, i, *default):
    try: return L[i]
    except: return default[0] if default else None

def raises(e): raise e

def dfilter(d, keys):
    """ Accepts dictionary and list of keys, returns a new dictionary
        with only the keys given """
    r = {}
    for k in keys:
        if k in d: r[k] = d[k]
    return r

def normalize(ws):
    ret = filter(lambda s: re.match('\w', s), re.split('\W', ws.lower()))
    return ret if len(ret) else ['']

def abs_url(secure = False, domain = None, subdomain = None):
    """Returns absolute url for this server, like 'https://thenewhive.com:1313/' """

    proto = 'https' if secure else 'http'
    port = config.ssl_port if secure else config.plain_port
    port = '' if port == 80 or port == 443 else ':' + str(port)
    return (proto + '://' + (subdomain + '.' if subdomain else '') +
        (domain or config.server_name) + port + '/')

def uniq(seq, idfun=None):
    # order preserving 
    if idfun is None: 
        def idfun(x): return x 
    seen = {} 
    result = [] 
    for item in seq: 
        marker = idfun(item) 
        # in old Python versions: 
        # if seen.has_key(marker) 
        # but in new ones: 
        if marker in seen: continue 
        seen[marker] = 1 
        result.append(item) 
    return result

def b64decode(s, add_padding=True, url_safe=True):
    if add_padding:
        s1 = s + "=" * ((4 - len(s) % 4) % 4)
    else:
        s1 = s
    if url_safe:
        return base64.urlsafe_b64decode(s1)
    else:
        return base64.b64decode(s1)

class memoized(object):
   """Decorator that caches a function's return value each time it is called.
   If called later with the same arguments, the cached value is returned, and
   not re-evaluated.
   """
   def __init__(self, func):
      self.func = func
      self.cache = {}
   def __call__(self, *args):
      try:
         return self.cache[args]
      except KeyError:
         value = self.func(*args)
         self.cache[args] = value
         return value
      except TypeError:
         # uncachable -- for instance, passing a list as an argument.
         # Better to not cache than to blow up entirely.
         return self.func(*args)
   def __repr__(self):
      """Return the function's docstring."""
      return self.func.__doc__
   def __get__(self, obj, objtype):
      """Support instance methods."""
      return functools.partial(self.__call__, obj)

def bound(num, lower_bound, upper_bound):
    if num < lower_bound: return lower_bound
    if num > upper_bound: return upper_bound
    return num
