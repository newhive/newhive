from newhive import state, config
from newhive.utils import *
import unittest

db = state.Database(config)
yan = db.User.fetch('yan', keyname='name')

def mongo_total(col):
    """return total size of a mongo collection"""
    return col.search({}).count()

def mongo_last(col):
    return col.search({}).sort([('updated', -1)])

def esdb_last(es_type):
    updated = db.esdb.conn.search(match_all_query, indices=db.esdb.index,
                               doc_types=es_type, sort="updated:desc")
    return updated

def efilter(expr):
    """print useful parts of an expression"""
    keys = ['tags', 'text', 'title', 'name', 'auth', 'owner_name',
            'updated', 'created', 'analytics', 'views']
    return dfilter(expr, keys)

class ExprTest(unittest.TestCase):
    """test cases for syncing mongo with elasticsearch"""
    def setUp(self):
        """create some docs to search for"""
        docs = [{'text': 'i hate atlas shrugged',
                 'title': 'a long rant',
                 'views': 20,
                 'tags': '#unittest, #books',
                 'name': 'bookrant'},
                {'text': 'i ate the bones',
                 'title': 'my favorite KFC commercial',
                 'views': 100,
                 'tags': '#unittest #popculture #sarcasm',
                 'title': 'irrelevant'}]
        self.new_ids = []
        self.docs = []
        self.size = len(docs)
        for d in docs:
            self.docs.append(TestExpr(doc=d))

    def test_add_to_mongo(self):
        """add these docs to mongo without indexing in es"""
        count_before = mongo_total(db.Expr)
        for d in self.docs:
            d.add_to_mongo(yan)
            self.new_ids.append(d.expr['_id'])
        count_after = mongo_total(db.Expr)
        self.assertEqual(count_before + self.size, count_after)
        print count_before
        print count_after

    def test_sync_add(self):
        count_before = db.esdb.get_total('expr-type')
        db.esdb.sync_with_mongo()
        count_after = db.esdb.get_total('expr-type')
        self.assertEqual(count_before + self.size, count_after)
        print count_before
        print count_after

    def test_sync_delete(self):
        count_before = db.esdb.get_total('expr-type')
        db.esdb.delete_by_ids(self.new_ids)
        count_after = db.esdb.get_total('expr-type')
        self.assertEqual(count_before - self.size, count_after)
        print count_before
        print count_after

    def test_remove_docs(self):
        count_before = mongo_total(db.Expr)
        for d in self.docs:
            did = d.expr['_id']
            d.delete_from_mongo()
            self.assertIsNone(db.Expr.fetch(did))
        count_after = mongo_total(db.Expr)
        print count_before
        print count_after

    def runTest(self):
        self.test_add_to_mongo()
        self.test_sync_add()
        self.test_remove_docs()
        self.test_sync_delete()

class QueryTest(ExprTest):
    """test some queries already"""
    def setUp(self):
        super(QueryTest, self).setUp()
        self.null_query = '"a ridiculous string"'
        super(QueryTest, self).test_add_to_mongo()
        super(QueryTest, self).test_sync_add()

    def tearDown(self):
        super(QueryTest, self).test_remove_docs()
        super(QueryTest, self).test_sync_delete()

    def test_null_search(self, query):
        """a search that should return no results"""
        r = db.query(query)
        self.assertTrue(len(r)==0)

    def test_text_search(self, query, fuzzy=False):
        """a text search that should return results"""
        r = db.query(query, fuzzy=fuzzy)
        self.assertTrue(len(r) > 0)
        print efilter(r)

    def test_fuzzy_search(self, query):
        """make sure fuzzy searches return more results"""
        r1 = db.query(query, fuzzy=False)
        r2 = db.query(query, fuzzy=True)
        self.assertTrue(r1.total < r2.total)

    def test_featured_search(self, query):
        """show featured when no user is logged in"""
        r1 = db.query('#Network_trending')
        r2 = db.query('#Featured')
        self.assertEqual(r1, r2)

    def test_network_search(self, user):
        """this should just go to the old method of network recent"""
        r = db.query('#Network', viewer=user)
        self.assertTrue(len(r) > 0)
        print efilter(r)

    def test_trending_search(self, user):
        """this should call elasticsearch"""
        r = db.query('#Network_trending', viewer=user)
        self.assertTrue(r.total > 0)
        print efilter(r)

    def test_auth_search(self, user):
        """only works for a user who has private exprs"""
        r1 = db.query('@'+user['name'])
        r2 = db.query('@'+user['name'], viewer=user)
        self.assertTrue(r1.total < r2.total)

    def runTest(self):
        self.test_null_search(self.null_query)
        self.test_text_search('#unittest')
        self.test_text_search('#unittest books')
        self.test_text_search('#food')
        self.test_fuzzy_search('lovely')
        self.test_featured_search()
        self.test_auth_search(yan)
        self.test_network_search(yan)
        self.test_trending_search(yan)


class PaginationTest(QueryTest):
    """test some pagination only for elasticsearch queries"""
    def test_search_single_page(self):
        pass
    def test_search_multi_page(self):
    def test_feed_single_page(self, user):
        pass
    def test_feed_multi_page(self, user):
        pass

class TestExpr(dict):
    """class for temporary test expressions"""
    def __init__(self, auth='public', views=0,
                 stars=0, broadcasts=0, doc={}):
        super(TestExpr, self).__init__()
        self['auth'] = auth
        self['views'] = views
        self['analytics'] = {'Star': {'count': stars},
                             'Broadcast': {'count': broadcasts}}
        self.expr = None
        self.update(doc)
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
    def update_mongo():
        self.expr.update(self)
    def delete_from_mongo(self):
        self.expr.delete()
        self.expr = None

if __name__=='__main__':
    unittest.main()