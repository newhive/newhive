import datetime
import pymongo
import pandas
import pytz
from newhive import config
from newhive.analytics.datastore import *
from newhive.analytics import functions

connection = pymongo.Connection(host=config.database_host, port=config.database_port)
adb = connection.analytics

def dtnow():
    return datetime.datetime.now(pytz.utc)

class Query(object):
    collection_name = None
    max_age = datetime.timedelta(days=1)

    def __init__(self, source_db, persistence_db=adb):
        """source_db is nehive.state.Database, persistance_db is pymongo database"""
        self.db = source_db
        self.collection = persistence_db[self.collection_name]

    def _persist(self, args, kwargs, dataframe):
        record = dataframe_to_record(dataframe)
        record.update({'args': args, 'kwargs': kwargs, 'source_db': self.db.mdb.name})
        self.collection.insert(record)

    def results(self):
        if self.age > self.auto_reload_age:
            self.execute(*args, **kwargs)

    def execute(self, *args, **kwargs):
        spec = {'args': args, 'kwargs': kwargs, 'source_db': self.db.mdb.name}
        result = self.collection.find_one(spec, sort=[('_id', -1)])
        if result and (dtnow() - result['_id'].generation_time) < self.max_age:
            return record_to_dataframe(result)
        else:
            return self.reexecute(*args, **kwargs)

    def reexecute(self, *args, **kwargs):
        result = self._execute(*args, **kwargs)
        self._persist(args, kwargs, result)
        return result

class UserJoinDates(Query):
    collection_name = 'user_join_dates'

    def _execute(self):
        cursor = self.db.User.search({})
        data = [(u['name'], datetime.datetime.fromtimestamp(u['created'])) for u in cursor]
        data = pandas.DataFrame(data, columns=['user', 'created'])
        data.index = data.pop('user')
        return data

class UserMedianViews(Query):
    collection_name = 'median_views'

    def _execute(self):
        cursor = self.db.User.search({'analytics.expressions.count': {'$gt': 0}})
        data = [(u['name'], functions.user_expression_summary(u).views.median()) for u in cursor]
        data = pandas.DataFrame(data, columns=['user', 'median_views'])
        data.index = data.pop('user')
        return data

if __name__ == "__main__":
    import newhive.state
    db = newhive.state.Database(config)
