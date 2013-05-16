from newhive import state, config
from newhive.utils import *
import unittest

db = state.Database(config)
yan = db.User.fetch('yan', keyname='name')

def mongo_total(col):
    """return total size of a mongo collection"""
    return col.search({}).count()


class ExprTest(unittest.TestCase):
    """test cases for searching / syncing mongo with elasticsearch"""
    def setUp(self):
        """create some docs to search for"""
        docs = [{'text': 'i hate atlas shrugged',
                 'title': 'a long rant',
                 'views': 20,
                 'tags': '#unittest, #books'},
                {'text': 'i ate the bones',
                 'title': 'my favorite KFC commercial',
                 'views': 100,
                 'tags': '#unittest #popculture #sarcasm'}]
        self.docs = []
        self.size = len(docs)
        for d in docs:
            self.docs.append(TestExpr(d))

    def test_add_to_mongo(self):
        """add these docs to mongo without indexing in es"""
        count_before = mongo_total(db.Expr)
        for d in self.docs:
            d.add_to_mongo(yan)
        count_after = mongo_total(db.Expr)
        self.assertEqual(count_before + self.size, count_after)

    def test_sync_add(self):
        count_before = db.esdb.get_total('expr-type')
        db.esdb.sync_with_mongo()
        count_after = db.esdb.get_total('expr-type')
        self.assertEqual(count_before + self.size, count_after)

    def test_sync_delete(self):
        pass

    def remove_docs(self):
        for d in self.docs:
            did = d['_id']
            d.delete_from_mongo()
            self.assertIsNone(db.Expr.fetch(did))

    def runTest(self):
        self.test_add_to_mongo()
        self.remove_docs()

class TestExpr(dict):
    """class for temporary test expressions"""
    def __init__(self, name, auth='public', views=0,
                 stars=0, broadcasts=0, **kwargs):
        super(TestExpr, self).__init__()
        self['name'] = name
        self['auth'] = auth
        self['views'] = views
        self['analytics'] = {'Star': {'count': stars},
                             'Broadcast': {'count': broadcasts}}
        self.expr = None
        self.update(**kwargs)
    def add_tags(self, tags):
        self.update({'tags': tags})
    def add_text(self, text):
        self.update({'text': text})
    def add_title(self, title):
        self.update({'title': title})
    def add_views(self, views):
        self['views'] += views
    def add_stars(self, stars):
        self['analytics']['Star']['count'] += stars
    def add_broadcasts(self, broadcasts):
        self['analytics']['Broadcast']['count'] += broadcasts
    def add_to_mongo(self, user):
        self.expr = user.expr_create(self)
    def delete_from_mongo(self):
        self.expr.delete()
        self.expr = None

