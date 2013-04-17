from __future__ import division
import time, random, re, base64, copy, pytz, pandas
from datetime import datetime
from newhive import config
import urlparse
import werkzeug.urls
import pymongo
from brownie.datastructures import OrderedSet
from collections import Counter, OrderedDict
import numpy
import operator
import pyes


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


def format_tags(s):
    return re.sub(r'[_\W]','',s.lower(), flags = re.UNICODE)


def normalize_tags(ws):
    # 1. if 'tags' has comma:  separate out quoted strings, split on all commas and hash, replace space with nothing
    # 2. if 'tags' does not have comma: separate out quoted strings, split on all spaces and hashes
    # 3. afterward: convert to lowercase, remove hashes, replace - with nothing, replace _ with nothing. actually just remove non-alphanumeric stuff.
    l1 = re.findall(r'"(.*?)"',ws,flags=re.UNICODE)
    ws_no_quotes = re.sub(r'"(.*?)"', '', ws, flags=re.UNICODE)
    if ',' in ws:
        l2 = re.split(r'[,#]', ws_no_quotes, flags=re.UNICODE)
    elif '#' in ws:
        l2 = re.split(r'[#]', ws_no_quotes, flags=re.UNICODE)
    else:
        l2 = re.split(r'[\s]', ws_no_quotes, flags=re.UNICODE)
    return list(set(filter(None,map(format_tags, l1+l2))))


def tagList(row):
    return normalize_tags(row.get('tags', ''))


def getTagCnt(data):
    tagCnt = Counter()
    for row in data:
        tags = row.get('tags', '')
        tagCnt.update(normalize_tags(tags))
    return tagCnt


def abs_url(path='', secure=False, domain=None, subdomain=None):
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


### utils for tag suggestion and autocomplete ###


blacklist = ['lovemenaut', 'paravion', 'moatzart', 'dain', 'fagerholm',
             'bethgirdler', 'i', 'be', 'of', 'the', 'a', 'an', 'in', 'on',
             'for', 'naut', 'is', 'and', 'to', 'from']

bad_tags = ['lovemenaut', 'paravion', 'moatzart', 'dain', 'fagerholm', 'bethgirdler', 'naut']  # blacklist minus stopwords


def find_similar_tags(tags, db):
    exclude = tags + bad_tags
    sim = {}
    clauses = []

    for tag in tags:
        clauses.append(pyes.query.TermQuery('tags', tag))

    query = pyes.query.BoolQuery(should=clauses).search()
    ts = pyes.facets.TermFacet(field='tags', name='tags', size=100, order="count", exclude=exclude)
    query.facet.facets.append(ts)
    res = db.esdb.conn.search(query, indices=db.esdb.index, doc_types="expr-type")

    for row in res.facets.tags.terms:
        q = pyes.query.TermQuery('tags', row['term'])
        freq = db.esdb.conn.search(q, indices=db.esdb.index, doc_types="expr-type").total
        if row['count'] > 2:
            sim[row['term']] = row['count']/numpy.sqrt(freq)

    print "sorting results"
    sim_sorted = sorted(sim.iteritems(), key=operator.itemgetter(1), reverse=True)
    results = [t[0] for t in sim_sorted]
    results_nodup = OrderedDict.fromkeys(results)
    return list(results_nodup)[:5]


def autocomplete(pre, db, field='tags'):
    s = re.sub(r'[\s_\-"]', '', pre, flags=re.UNICODE)
    query = pyes.query.MatchAllQuery().search()
    ts = pyes.facets.TermFacet(field=field, name='tags', size=5, order="count",
                               exclude=blacklist, regex=s+'.*',
                               regex_flags=["DOTALL", "CASE_INSENSITIVE"])
    query.facet.facets.append(ts)
    res = db.esdb.conn.search(query, indices=db.esdb.index, doc_types="expr-type")
    return res.facets.tags.terms


def others_liked(expr, db):

    # recommend expressions: "users who liked this also liked ___"

    # get the set of all feed items that are broadcasts/stars of this expr

    this_expr = expr['_id']
    f1 = pyes.filters.TermFilter('entity', this_expr)
    f2 = pyes.filters.TermsFilter('class_name', ['Broadcast', 'Star'])
    f = pyes.filters.BoolFilter(must=[f1, f2])
    q = pyes.query.MatchAllQuery()
    fq = pyes.query.FilteredQuery(q, f)
    expr_activity = db.esdb.conn.search(fq, indices=db.esdb.index, doc_types="feed-type")

    if expr_activity.total > 1:

        # find users who also liked this expression

        related_users = []

        for r in expr_activity:
            related_users.append(r['initiator'])

        related_users = list(set(related_users))

        # find expressions that users who liked this expression also liked

        f1 = pyes.filters.TermsFilter('initiator', related_users)
        f3 = pyes.filters.TermFilter('entity_class', 'expr')
        f = pyes.filters.BoolFilter(must=[f1, f2, f3])
        query = pyes.query.FilteredQuery(q, f).search()
        ts = pyes.facets.TermFacet(field='entity', name='entity', order="count", exclude=[this_expr], size=5)
        query.facet.facets.append(ts)  # sort by number of likes
        other_exprs = db.esdb.conn.search(query, indices=db.esdb.index, doc_types="feed-type")

        res = other_exprs.facets.entity.terms

    else:
        res = None

    return res


def get_user_tag_likes(user, db):

    # get statistics on what tags a user likes (broadcasts, stars)

    this_user = user['_id']

    f1 = pyes.filters.TermFilter('initiator', this_user)
    f2 = pyes.filters.TermsFilter('class_name', ['Broadcast', 'Star'])
    f = pyes.filters.BoolFilter(must=[f1, f2])
    q = pyes.query.MatchAllQuery()
    fq = pyes.query.FilteredQuery(q, f)

    user_activity = db.esdb.conn.search(fq, indices=db.esdb.index, doc_types="feed-type")

    if user_activity.total > 1:
        exprs_liked = []
        for r in user_activity:
            exprs_liked.append(r['entity'])
        f = pyes.filters.IdsFilter(exprs_liked)
        query = pyes.query.FilteredQuery(q, f).search()
        ts = pyes.facets.TermFacet(field='tags', name='tags', order="count", size=5)
        query.facet.facets.append(ts)  # sort by number of likes
        other_tags = db.esdb.conn.search(query, indices=db.esdb.index, doc_types="expr-type")
        res = other_tags.facets.tags.terms
    else:
        res = None

    return res


def get_tag_user_likes(tag, db):

    # get statistics on which users like a tag the most (broadcasts, stars)

    # get id's of expressions with this tag

    f = pyes.filters.TermFilter('tags', tag)
    q = pyes.query.MatchAllQuery()
    fq = pyes.query.FilteredQuery(q, f)

    tagged_exprs = db.esdb.conn.search(fq, indices=db.esdb.index, doc_types="expr-type")

    if tagged_exprs.total > 0:
        exprs = []
        for r in tagged_exprs:
            exprs.append(r._meta.id)
        # then find all "likes" for expressions with this tag in the feed
        f1 = pyes.filters.TermsFilter('entity', exprs)
        f2 = pyes.filters.TermsFilter('class_name', ['Broadcast', 'Star'])
        f = pyes.filters.BoolFilter(must=[f1, f2])
        query = pyes.query.FilteredQuery(q, f).search()
        ts = pyes.facets.TermFacet(field='initiator_name', name='initiator_name', order="count", size=5)
        query.facet.facets.append(ts)  # sort by number of likes
        people_liked = db.esdb.conn.search(query, indices=db.esdb.index, doc_types="feed-type")
        res = people_liked.facets.initiator_name.terms
    else:
        res = None

    return res
