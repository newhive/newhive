import time, random, re, base64, copy, pytz, pandas
from datetime import datetime
from newhive import config
import urlparse
import werkzeug.urls
import pymongo
from brownie.datastructures import OrderedSet


def lget(l, i, *default):
    try: return l[i]
    except: return default[0] if default else None
def lset(l, i, e, *default):
    default = default[0] if default else [None]
    if i < len(l): l[i] = e
    else: l.extend(default * (i - len(l)) + [e])
def index_of(l, f):
    for i, e in enumerate(l):
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

def dcast(d, type_schemas, filter=True):
    """ Accepts a dictionary d, and type_schemas -- a list of tuples in these forms:
            (dictionary_key, type_to) :: (str, type)
            (dictionary_key, type_to, required) :: (str, type, bool)
        For each tuple in type_schemas, dcast coerces the dictionary_key in d to the type_to
            If type_to is None, no coercion is performed
            If required is True, an exception is thrown if dictionary_key is not in d
            In the case of a 2 tuple, no exception is thrown
        returns new dictionary only containing keys found in type_schemas if filter is True
            otherwise return a copy of d with the keys found in type_schemas coerced
        throws ValueError
    """
    out = {} if filter else dict(d)
    for schema in type_schemas:
        key = schema[0]
        type_to = schema[1]
        required = lget(schema, 2, False)

        if key in d: out[key] = type_to(d[key]) if type_to else d[key]
        elif required: raise ValueError('key %s missing in dict' % (key))
    return out


def datetime_to_id(d):
    return str(pymongo.objectid.ObjectId.from_datetime(d))

def now(): return time.time()

def time_s(t):
    return int(t.strftime('%s')) if (type(t) == datetime) else t

def time_u(t): return datetime.utcfromtimestamp(t)

def datetime_to_int(dt):
    return int(time.mktime(dt.timetuple()))

def datetime_to_str(dt):
    return str(datetime_to_int(dt))

def junkstr(length):
    """Creates a random base 62 string"""

    def chrange(c1, c2): return [chr(i) for i in range(ord(c1), ord(c2)+1)]
    chrs = chrange('0', '9') + chrange('A', 'Z') + chrange('a', 'z')
    return ''.join([chrs[random.randrange(0, 62)] for _ in range(length)])

def lget(l, i, *default):
    try: return l[i]
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
    return list( OrderedSet( filter( lambda s: re.match('\w', s, flags=re.UNICODE),
        re.split('\W', ws.lower(), flags=re.UNICODE) ) ) )

def abs_url(path='', secure = False, domain = None, subdomain = None):
    """Returns absolute url for this server, like 'https://thenewhive.com:1313/' """

    ssl = secure or config.always_secure
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

def cached(fn):
    def inner(self):
        prop = '_cache_' + fn.__name__
        if not hasattr(self, prop):
            setattr(self, prop, fn(self))
        return getattr(self, prop)
    return inner

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
    is_secure = property(lambda self:
        self._wrapped_obj.is_secure or config.always_secure or
            self.headers.get('X-Forwarded-Proto') == 'https')

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

def count(l):
    c = {}
    for v in l: c[v] = c.get(v, 0) + 1
    return sorted([(c[v], v) for v in c])

class URL(object):
    def __init__(self, string):
        self.scheme, self.netloc, self.path, self.params, self._query, self.fragment = urlparse.urlparse(string)
        self._query = werkzeug.urls.url_decode(self._query)

    @property
    def query(self):
        return self._query

    def get_url(self):
        query = werkzeug.url_encode(self._query)
        return urlparse.ParseResult(self.scheme, self.netloc, self.path, self.params, query, self.fragment).geturl()
    __str__ = get_url

class AbsUrl(URL):
    def __init__(self, path='', user='', page='', secure=True):
        if user and not path:
            path = user + '/' + page
        super(AbsUrl, self).__init__(abs_url(secure=secure) + path)

def modify_query(url, d):
    url_obj = isinstance(url, URL)
    if not url_obj: url = URL(url)

    url.query.update(d)

    if url_obj:
        return url
    else:
        return url.get_url()

def set_cookie(response, name, data, secure = False, expires = True):
    expiration = None if expires else datetime(2100, 1, 1)
    max_age = 0 if expires else None
    response.set_cookie(name, value = data, secure = secure,
        # no longer using subdomains
        #domain = None if secure else '.' + config.server_name, httponly = True,
        expires = expiration)
def get_cookie(request, name): return request.cookies.get(name, False)
def rm_cookie(response, name, secure = False): response.delete_cookie(name,
    domain = None if secure else '.' + config.server_name)

def local_date(offset=0):
    tz = pytz.timezone('US/Pacific')
    dt = datetime.now(tz)
    return dt.date() + pandas.DateOffset(days=offset)

def dates_to_spec(start, end=None, offset=None):
    """Return a mongodb spec dictionary that will match ids of objects created
    between date and date + offset"""
    end = end or start + offset
    return {'$gt': datetime_to_int(start), '$lte': datetime_to_int(end)}

def un_camelcase(s): return re.sub(r'([A-Z])', r' \1', s)

def camelcase(s): return " ".join(s.split('_')).title().replace(' ', '')

def percent_change(ratio, precision=0):
    s = "down" if ratio < 0 else "up"
    return ("{} {:." + str(precision) + "f}%").format(s, abs(ratio) * 100)

def analytics_email_number_format(number):
    """
    >>> analytics_email_number_format(123)
    '123'

    >>> analytics_email_number_format(99.12345)
    '99.12'

    >>> analytics_email_number_format(0.000123)
    '0.00012'
    """

    r = r'([0-9]*)(\.(0*)([0-9]*))?'
    whole, remainder, zeros, decimal = re.match(r, str(number)).groups()
    if not decimal: return whole
    return whole + "." + zeros + decimal[:2]
