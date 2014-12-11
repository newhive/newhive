def mq(**d):
    return Query(d)

class Query(dict):
    def __init__(self, d):
        dict.update(self, d)
        self.where = self.js

    def list_filter(self, key, *arg, **args):
        self[key] = { '$elemMatch': arg[0] if len(arg) else args }
        return self

    def is1(self, key, *l):
        return self.addd(key, '$in', l)

    def gt(self, key, val):
        return self.addd(key, '$gt', val)

    def lt(self, key, val):
        return self.addd(key, '$lt', val)

    def bt(self, key, val1, val2):
        self.gt(key, val1)
        return self.lt(key, val2)

    def all(self, key, *l):
        if type( l[0] ) == list: l = l[0]
        return self.addd(key, '$all', l)

    def exists(self, key, existance=True):
        return self.addd(key, '$exists', existance)

    def ne(self, key, val):
        return self.addd(key, '$ne', val)

    def js(self, val):
        self['$where'] = val
        return self

    def add(self, key, val):
        self[key] = val
        return self

    def addd(self, key, prop, val):
        self.setdefault(key, {})
        self[key][prop] = val
        return self

    @property
    def mnot(self):
        return Query({'$not': self})
