import time
from datetime import datetime

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
