import datetime
import time
import pymongo
import pandas
import pytz
import apiclient.http
import httplib2
import numpy

from newhive import config
from newhive.analytics import functions
from functions import dataframe_to_record, record_to_dataframe
from newhive.analytics.ga import GAQuery, QueryResponse
import newhive.utils
from newhive.utils import local_date, dates_to_spec, friendly_log_scale
#from pandas.datetools import Day
Day = pandas.datetools.Day

import logging
logger = logging.getLogger(__name__)

connection = pymongo.Connection(host=config.database_host, port=config.database_port)
adb = connection[config.analytics_db]
min_start_date = datetime.date(2011, 4, 16)

def clear_all_caches():
    for col in adb.collection_names():
        adb[col].remove()

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
        if result and (functions.dtnow() - result['_id'].generation_time) < self.max_age:
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
        data = [(u['_id'], u['name'], functions.user_expression_summary(u).views.median()) for u in cursor]
        data = pandas.DataFrame(data, columns=['id', 'user', 'median_views'])
        data.index = data.pop('id')
        return data

class ExpressionViews(Query):
    collection_name = 'expression_views'

    def _execute(self):
        cursor = self.db.Expr._col.find({'$or': [{'password': ''}, {'auth': 'public'}]}, ['owner', 'views'])
        data = [[e['_id'], e['owner'], e.get('views', 0) ] for e in cursor]
        data = pandas.DataFrame(data, columns=['id', 'owner', 'views'])
        return data

class UserExpressionSummary(Query):
    collection_name = 'user_expression_summary'

    def _execute(self):
        expressions = ExpressionViews(self.db).execute()
        grouped = expressions.groupby('owner')
        data = grouped.aggregate([numpy.count_nonzero, numpy.sum, numpy.median])
        data.columns = ['count', 'sum', 'median']

        cursor = self.db.User._col.find({}, ['name', 'email'])
        users = [[x['_id'], x['name'], x['email']] for x in cursor]
        users = pandas.DataFrame(users, columns=['id', 'name', 'email'])
        users.index = users.pop('id')

        data = users.join(data, how='right')
        return data

class CreatedPerDay(Query):

    def _execute(self, collection, spec=None, fields=None):
        if not spec:   spec   = {}
        if not fields: fields = []
        method = collection.find if type(collection) is pymongo.collection.Collection else collection.search
        cursor = method(spec, fields=fields + ['created'])
        def extract(item):
            return [item.get(field) for field in fields] + \
                   [datetime.datetime.fromtimestamp(item['created'])]
        data = map(extract, cursor)
        data = pandas.DataFrame(data, columns=fields + ['created'])
        data['date'] = data.created.apply(lambda d: (d - pandas.DateOffset(hours=8)).date())
        per_day = pandas.DataFrame(data.groupby('date').count().created)
        per_day.columns = [self.name]
        return per_day

class ExpressionsCreatedPerDay(CreatedPerDay):
    name = 'Expressions Created/Day'
    collection_name = 'expressions_per_day'

    def _execute(self):
        collection = self.db.Expr._col
        spec = {'apps': {'$exists': True}}
        return super(ExpressionsCreatedPerDay, self)._execute(collection, spec)

class LovesPerDay(CreatedPerDay):
    name = 'Loves Per Day'
    collection_name = 'loves_per_day'

    def _execute(self):
        collection = self.db.Star
        spec = {'entity_class': 'Expr'}
        return super(LovesPerDay, self)._execute(collection, spec)

class ListensPerDay(CreatedPerDay):
    name = 'Listens Per Day'
    collection_name = 'listens_per_day'

    def _execute(self):
        collection = self.db.Star
        spec = {'entity_class': 'User', 'entity': {'$ne': self.db.User.named('thenewhive').id}}
        return super(ListensPerDay, self)._execute(collection, spec)

class UsersPerDay(CreatedPerDay):
    name = 'New Users Per Day'
    collection_name = 'users_per_day'

    def _execute(self):
        collection = self.db.User._col
        return super(UsersPerDay, self)._execute(collection)

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
        q.start_date(min_start_date)
        return q.execute()

class Active(Query):
    collection_name = 'active'

    def _execute(self, period):
        def actions_per_user_per_day():
            map1 = """
                function() {
                    date = new Date((this.created - 12*3600) * 1000);
                    day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12);
                    emit({name: this.user_name, date: day/1000}, 1);
                }"""

            reduce = """
                function(key, values) {
                    var total=0;
                    for (var i=0; i < values.length; i++) {
                        total += values[i];
                    }
                    return total;
                }"""

            mr1_name = 'mr.actions_per_user_per_day'
            mr1 = self.db.mdb[mr1_name]
            latest = mr1.find_one(sort=[('_id.date', -1)])['_id']['date']
            # The following line performs incremental map reduce, but depends on mongodb version >= 1.8
            return self.db.ActionLog._col.map_reduce(map1, reduce, mr1_name, merge_output=True, query={'created': {'$gt': latest - 24*3600}})

        mr_col = actions_per_user_per_day()
        mr_col.ensure_index('_id.date')
        offset = pandas.DateOffset(days=period)
        start = newhive.utils.time_u(mr_col.find_one(sort=[('_id.date', 1)])['_id']['date'])
        index = pandas.DateRange(start=start + offset, end=datetime.datetime.now(), offset=pandas.DateOffset(days=1))

        def users_active_on(date):
            cursor = mr_col.find({'_id.date': dates_to_spec(date - offset, date) })
            return len(cursor.distinct('_id.name'))

        data = pandas.DataFrame(index=index, data={'Active{}'.format(period): index.map(users_active_on)})
        return data

class ActiveGA(Query):
    collection_name = 'active_ga'

    def _execute(self):
        q = GAQuery()\
            .start_date(  min_start_date         )\
            .end_date(    local_date()           )\
            .metrics(     ['ga:visits']          )\
            .dimensions(  ['ga:date', 'ga:customVarValue1'] )
        return q.execute()

class UserImpressions(Query):
    collection_name = 'user_impressions'

    def _execute(self):

        map_function = """
            function() {
                 if (typeof(this.apps) != "undefined" && this.apps.length > 0 && this.views && this.owner_views){
                     emit(this.owner, {count: 1, views: this.views});
                 }
            }
            """

        reduce = """
            function(key, values) {
                result = {count: 0, views: 0};
                for (var i=0; i < values.length; i++) {
                    result.count += values[i].count;
                    result.views += values[i].views;
                };
                return result;
            }"""

        results_collection = self.db.mdb.expr.map_reduce(map_function, reduce, 'mr.overall_impressions_per_user')
        data = pandas.Series([x['value']['views'] for x in results_collection.find()])
        users, bins = numpy.histogram(data, friendly_log_scale(1, data.max() * 10, [1]))
        return pandas.DataFrame.from_items([('lower', bins[:-1]), ('upper', bins[1:]), ('users', users)])


if __name__ == "__main__":
    import newhive.state
    db = newhive.state.Database(config)
    db_live = newhive.state.Database(config, db_name='hive')
