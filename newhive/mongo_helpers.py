def mnot(e): return {'$not': e}

def mq(**d):
    return Query(d)

class Query(dict):
    def __init__(self, d):
        dict.update(self, d)

    def is1(self, key, *l):
        self.setdefault(key, {})
        self[key].update({ '$in': l })
        return self

    def gt(self, key, val):
        self.setdefault(key, {})
        self[key].update({ '$gt': val })
        return self

    def lt(self, key, val):
        self.setdefault(key, {})
        self[key].update({ '$lt': val })
        return self

    def bt(self, key, val1, val2):
        self.gt(key, val1)
        self.lt(key, val2)
        return self

    def all(self, key, *l):
        if type( l[0] ) == list: l = l[0]
        self[key] = {'$all': l}
        return self

    def exists(self, key):
        self[key] = {'$exists': True}
        return self

    def add(self, key, val):
        self[key] = val
        return self
