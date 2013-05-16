from newhive import state, config
from newhive.utils import *
import unittest

db = state.Database(config)
yan = db.User.fetch('yan', keyname='name')


class DBSyncTest(unittest.TestCase):
    """test cases for syncing mongo with elasticsearch"""
    def setUp(self):
        docs = [{'name': 'a_tremendously_unlikely_title',
                'text': 'i hate atlas shrugged',
                'auth': 'public',
                'views': 40,
                'title': 'a long rant'}]
        self.docs = docs
        for d in docs:
            yan.expr_create(d)

    def tearDown(self):
        for d in self.docs:
            e = db.Expr.fetch(d['name'], keyname='name')
            e.delete()
