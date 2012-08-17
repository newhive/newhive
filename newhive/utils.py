import time, random, re, base64, copy
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
def dupdate(d1, d2): return dict(d1.items() + d2.items())


def now(): return time.time()

def time_s(t):
    return int(t.strftime('%s')) if (type(t) == datetime) else t

def time_u(t): return datetime.utcfromtimestamp(t)

def datetime_to_int(dt):
    return int(time.mktime(dt.timetuple()))

def datetime_to_str(dt):
    return str(datetime_to_int(dt))


def junkstr(length):
    """Creates a random base 64 string"""

    def chrange(c1, c2): return [chr(i) for i in range(ord(c1), ord(c2)+1)]
    chrs = chrange('0', '9') + chrange('A', 'Z') + chrange('a', 'z') + ['.', '-']
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

def abs_url(path='', secure = False, domain = None, subdomain = None):
    """Returns absolute url for this server, like 'https://thenewhive.com:1313/' """

    ssl = secure or config.always_ssl
    domain = domain or config.server_name
    if domain.find('.' + config.server_name) > -1:
        (subdomain, domain) = domain.split('.', 1)
    if config.dev_prefix: domain = config.dev_prefix + '.' + domain
    proto = 'https' if ssl else 'http'
    port = config.ssl_port if ssl else config.plain_port
    port = '' if port == 80 or port == 443 else ':' + str(port)
    return (
        proto + '://' +
        (subdomain + '.' if subdomain else '') +
        domain + port + '/' +
        re.sub('^/', '', path)
    )

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

# Wrapper class from http://code.activestate.com/recipes/577555-object-wrapper-class/
class Wrapper(object):
    '''
    Object wrapper class.
    This a wrapper for objects. It is initialiesed with the object to wrap
    and then proxies the unhandled getattribute methods to it.
    Other classes are to inherit from it.
    '''
    def __init__(self, obj):
        '''
        Wrapper constructor.
        @param obj: object to wrap
        '''
        # wrap the object
        self._wrapped_obj = obj

    def __getattr__(self, attr):
        # see if this object has attr
        # NOTE do not use hasattr, it goes into
        # infinite recurrsion
        if attr in self.__dict__:
            # this object has it
            return getattr(self, attr)
        # proxy to the wrapped object
        return getattr(self._wrapped_obj, attr)

class Request(Wrapper):
    is_secure = property(lambda self: self._wrapped_obj.is_secure or self.headers.get('X-Forwarded-Proto') == 'https')

def exception_test(*args, **kwargs):
    raise Exception('dummy exception')

def timer(func):
    t0 = now()
    r = func()
    t1 = now()
    print t1 - t0
    return r

def key_map(original, transformation, filter=False):
    output = copy.copy(original)
    for old, new in transformation.items():
        if output.has_key(old):
            output[new] = output.pop(old)
    if filter:
        return dfilter(output, transformation.values())
    else:
        return output

def is_mongo_key(string):
    return isinstance(string, basestring) and re.match('[0-9a-f]{24}', string)

def set_trace(interactive=False):
    if interactive or config.interactive:
        import ipdb;
        return ipdb.set_trace
    else:
        return lambda: None

def serializable_filter(dictionary):
    return {key.replace('.', '-'): val
            for key, val in dictionary.iteritems()
            if type(val) in [bool, str, int, float, tuple, unicode]}
