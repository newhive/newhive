import os, re, json, time, mimetypes
from datetime import datetime
from newhive import config, colors, auth
from newhive.state import abs_url
import newhive.ui_strings.en as ui
from newhive.utils import time_u

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

def date_to_epoch(*args): return int(time.mktime(datetime(*args).timetuple()))

def querystring(d):
    out = "?"
    for key, val in d.items():
        out = out + key + "=" + val + "&"
    return out[:-1]

def friendly_date(then):
    """Accepts datetime.datetime, returns string such as 'May 23' or '1 day ago'. """
    if type(then) in [int, float]:
      then = time_u(then)

    now = datetime.utcnow()
    dt = now - then
    if dt.seconds < 60:
        return "just now"
    months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    s = months[then.month] + ' ' + str(then.day)
    if then.year != now.year: s += ' ' + str(then.year)
    if dt.days < 7:
        if not dt.days:
            if dt.seconds < 3600: (t, u) = (dt.seconds / 60, 'min')
            else: (t, u) = (dt.seconds / 3600, 'hr')
        else: (t, u) = (dt.days, 'day')
        s = str(t) + ' ' + u + ('s' if t > 1 else '') + ' ago'
    return s

def large_number(number):
    if number < 10000: return str(number)
    elif 10000 <= number < 1000000:
        return str(int(number/1000)) + "K"
    elif 1000000 <= number < 10000000:
        return str(math.floor(number/100000)/10) + "M"
    elif 10000000 <= number:
        return str(int(number/1000000)) + "M"

def length_bucket(t):
    l = len(t)
    if l < 10: return 1
    if l < 20: return 2
    return 3

