import re
from newhive.utils import now

def mq(*d, **keys):
    return Query(*d, **keys)

class Query(dict):
    def __init__(self, *d, **keys):
        dict.update(self, *d, **keys)
        self.where = self.js

    def set_go(self, callback):
        self.go = callback
    def __call__(self, **dbargs):
        return self.go(self, **dbargs)

    def list_filter(self, key, *arg, **args):
        self[key] = { '$elemMatch': arg[0] if len(arg) else args }
        return self

    def is1(self, key, *l):
        if isinstance(l[0], list): l = l[0]
        return self.add_to(key, '$in', l)

    def gt(self, key, val):
        return self.add_to(key, '$gt', val)
    def gte(self, key, val):
        return self.add_to(key, '$gte', val)

    def lt(self, key, val):
        return self.add_to(key, '$lt', val)
    def lte(self, key, val):
        return self.add_to(key, '$lte', val)

    def bt(self, key, val1, val2):
        self.gt(key, val1)
        return self.lt(key, val2)

    def all(self, key, *l):
        if type( l[0] ) == list: l = l[0]
        return self.add_to(key, '$all', l)

    def exists(self, key, existance=True):
        return self.add_to(key, '$exists', existance)

    def ne(self, key, val):
        return self.add_to(key, '$ne', val)

    def js(self, val):
        self['$where'] = val
        return self

    def re(self, key, regex):
        return self.add(key, re.compile(regex))
    def nre(self, key, regex):
        return self.add(key, { '$not': re.compile(regex) })
        
    def add(self, key, val):
        self[key] = val
        return self

    def add_to(self, key, prop, val):
        self.setdefault(key, {})
        self[key][prop] = val
        return self

    def _or(self, *clauses):
        self.setdefault('$or', [])
        self['$or'].extend(clauses)
        return self

    @property
    def mnot(self):
        return Query({'$not': self})

    # tired of typing 'now() - 86400 * foo'. 
    def day(self, key, days_ago, day_span=1):
        """ Assumes value of key is a timestamp. Converts days_ago from
        days into past to timestamp t and day_span to days past days_ago """
        n = now()
        t = n - 86400 * days_ago
        self.bt(key, t, t + day_span * 86400)
        return self
