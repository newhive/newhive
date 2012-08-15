import pymongo

def mnot(e): return {'$not': e}

def m(**d):
    return Query(d)

class Query(dict):
    def __init__(self, d):
        dict.update(self, d)

    def gt(self, key, val):
        self[key] = {'$gt': val}
        return self

    def lt(self, key, val):
        self[key] = {'$lt': val}
        return self

    def bt(self, key, val1, val2):
        self.gt(key, val1)
        self.lt(key, val2)
        return self

    def all(self, key, val):
        self[key] = {'$all': val}
        return self

    def exists(self, key):
        self[key] = {'$exists': True}
        return self

    def add(self, key, val):
        self[key] = val
        return self
