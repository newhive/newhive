import datetime
import time
import pymongo
import pandas
import pytz
import apiclient.http
import httplib2
from newhive import config
from newhive.analytics.datastore import *
from newhive.analytics import functions
from newhive.analytics.ga import GAQuery, QueryResponse
from newhive.utils import local_date
#from pandas.datetools import Day
Day = pandas.datetools.Day

import logging
logger = logging.getLogger(__name__)

connection = pymongo.Connection(host=config.database_host, port=config.database_port)
adb = connection.analytics

def dtnow():
    return datetime.datetime.now(pytz.utc)

class Query(object):
    collection_name = None
    max_age = datetime.timedelta(days=1)

    def _serialize(self, data):
        dtype = type(data)
        if dtype in [pandas.DataFrame, pandas.Series]:
            rv = dataframe_to_record(data)
        elif dtype == dict:
            rv = data
        elif dtype == QueryResponse:
            rv = dict(data)
        else:
            raise ValueError("Cannot serialize object of type {}".format(dtype))
        rv.update(type=str(dtype))
        return rv

    def _deserialize(self, record):
        dtype = record.get('type')
        if dtype == str(pandas.DataFrame):
            return record_to_dataframe(record)
        elif dtype == str(dict):
            return record
        elif dtype == str(QueryResponse):
            return QueryResponse(record)
        else:
            return record_to_dataframe(record)

    def _spec(self, args, kwargs):
        serialized_args = map(lambda a: str(a) if type(a) is datetime.date else a, args)
        return {'args': serialized_args, 'kwargs': kwargs, 'source_db': self.db.mdb.name if self.db else None}

    def __init__(self, source_db=None, persistence_db=adb):
        """source_db is nehive.state.Database, persistance_db is pymongo database"""
        self.db = source_db
        self.collection = persistence_db[self.collection_name]

    def _persist(self, args, kwargs, data):
        record = self._serialize(data)
        record.update(self._spec(args, kwargs))
        self.collection.insert(record)

    def results(self):
        if self.age > self.auto_reload_age:
            self.execute(*args, **kwargs)

    def execute(self, *args, **kwargs):
        spec = self._spec(args, kwargs)
        spec.update(invalidated = {'$exists': False})
        result = self.collection.find_one(spec, sort=[('_id', -1)])
        if result and (dtnow() - result['_id'].generation_time) < self.max_age:
            logger.info('using cached result')
            return self._deserialize(result)
        else:
            logger.info('cached result not present or too old, reexecuting query')
            return self.reexecute(*args, **kwargs)

    def reexecute(self, *args, **kwargs):
        result = self._execute(*args, **kwargs)
        self._persist(args, kwargs, result)
        return result

    def invalidate_cache(self, drop=False):
        if drop:
            self.collection.remove()
        else:
            self.collection.update({}, {'$set': {'invalidated': True}}, multi=True)

class UserJoinDates(Query):
    collection_name = 'user_join_dates'

    def _execute(self):
        cursor = self.db.User.search({})
        data = [(u['name'], datetime.datetime.fromtimestamp(u['created'])) for u in cursor]
        data = pandas.DataFrame(data, columns=['user', 'created'])
        data.index = data.pop('user')
        data['date'] = data.created.apply(lambda d: (d - pandas.DateOffset(hours=8)).date())
        return data

class UserMedianViews(Query):
    collection_name = 'median_views'

    def _execute(self):
        cursor = self.db.User.search({'analytics.expressions.count': {'$gt': 0}})
        data = [(u['name'], functions.user_expression_summary(u).views.median()) for u in cursor]
        data = pandas.DataFrame(data, columns=['user', 'median_views'])
        data.index = data.pop('user')
        return data

class ExpressionCreateDates(Query):
    collection_name = 'expression_create_dates'

    def _execute(self):
        cursor = self.db.Expr.search({'apps': {'$exists': True}})
        data = [(u.get('owner_name'), u.get('name'), datetime.datetime.fromtimestamp(u['created'])) for u in cursor]
        data = pandas.DataFrame(data, columns=['user', 'expr', 'created'])
        data['date'] = data.created.apply(lambda d: (d - pandas.DateOffset(hours=8)).date())
        return data

class ExpressionsCreatedPerDay(Query):
    collection_name = 'expressions_per_day'

    def _execute(self):
        ecd = ExpressionCreateDates(self.db).execute()
        epd = ecd.groupby('date').count().created
        return epd

class DailyRetention(Query):
    collection_name = 'daily_retention'

    def _joined_on(self, dtime):
        try:
            group = self._grouped.get_group(dtime.date())
            return set(group.index.tolist())
        except KeyError:
            return set()

    def _active_on(self, dtime):
        record = adb.daily_active.find_one({'date': dtime})
        if record:
            return set(record['users'])
        else:
            return None

    def _retention(self, join_date):
        days = range(0,30)
        users = self._joined_on(join_date)
        total = len(users)
        def map_fun(day):
            active = self._active_on(join_date + pandas.DateOffset(days=day))
            if active is not None:
                return len(active.intersection(users))
            else:
                return float('NaN')
        active = [map_fun(day) for day in days]
        return total, pandas.Series(active, index=days)

    def _execute(self, start):
        def populate_active_collection():

            def find_latest():
                record = adb.daily_active.find_one({}, {'date': True}, sort=[('date', -1)])
                return record['date']

            def store_result(date):
                def callback(id, result, error):
                    if error is not None:
                        print error
                    else:
                        result = QueryResponse(result)
                        users = [r[0] for r in result.rows]
                        newdoc = {'date': date, 'users': users, 'total': result.total}
                        adb.daily_active.update({'date': date}, {'$set': newdoc}, upsert=True)
                return callback

            query = GAQuery(metrics=['ga:visits'], dimensions=['ga:customVarValue1'])
            # slight overlap ensures possibly incomplete latest day gets overwritten with complete data
            start = find_latest()
            today = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
            while start < datetime.datetime.now():
                batch = apiclient.http.BatchHttpRequest()
                range = pandas.DatetimeIndex(start=start, periods=10, freq='D')
                for timestamp in range:
                    date = timestamp.to_datetime()
                    if date >= today:
                        continue
                    query.start_date(date).end_date(date)
                    batch.add(query.query(), store_result(date))
                batch.execute(http=httplib2.Http())
                print "finished batch starting {}".format(start)
                start += pandas.DateOffset(days=10)
                time.sleep(1)

        populate_active_collection()
        self._grouped = UserJoinDates(self.db).execute().groupby('date')
        end = datetime.datetime.today()
        drange = pandas.DatetimeIndex(start=start, end=end, freq='D')
        totals = []
        data = []
        for ts in drange:
            total, datum = self._retention(ts.to_datetime())
            totals.append(total)
            data.append(datum)
        data = pandas.DataFrame(data, index=drange)
        data['total'] = totals
        return data

class GASummary(Query):
    collection_name = 'ga_summary'

    def _execute(self, date):
        if date >= local_date(): logger.warn('running GASummary on unfinished day')
        q = GAQuery(dimensions=['ga:date'], metrics=['ga:visitors', 'ga:visits', 'ga:newVisits'])
        q.end_date(date)
        q.start_date(date - pandas.DateOffset(days=35))
        return q.execute()


if __name__ == "__main__":
    import newhive.state
    db = newhive.state.Database(config)
    db_live = newhive.state.Database(config, db_name='hive')
