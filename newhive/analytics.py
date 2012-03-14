import time, datetime, re, pandas, newhive, pandas
from newhive import state, oauth
from newhive.state import now
from brownie.datastructures import OrderedDict

import logging
logger = logging.getLogger(__name__)

def shared_user_data(db, result, start=None):
    custom_counts = {}
    auths = ['public', 'private', 'total']
    for auth in auths:
        custom_counts[auth] = {}
    for item in result:
      user = db.User.fetch(item['owner'])
      if user:
        item['name'] = user.get('name')
        item['age'] = (time.time() - user['created']) / 3600 /24
        item['updated'] = user['updated']
        if start and start != 0:
            if user['created'] < start: 
                item['include_custom'] = True
                for auth in auths:
                    for i in range(min(int(item[auth]['custom']), 30) +1):
                        if custom_counts[auth].has_key(i):
                            custom_counts[auth][i] += 1
                        else:
                            custom_counts[auth][i] = 1
        try:
          item['first_month'] = user['analytics']['first_month']
        except KeyError:
          item['first_month'] = None
      else: item['name'] = item['owner']
    return [result, custom_counts]


def active_users(db, reference_date=time.time(), event='created', start=0, end=0):
    col = db.mdb['expr']
    key={"owner": 1}
    condition = {}
    initial = {
        "total": {"total":0, "day":0, "week": 0, "month": 0, "custom": 0},
        "private": {"total":0, "day":0, "week": 0, "month": 0, "custom": 0},
        "public": {"total":0, "day":0, "week": 0, "month": 0, "custom": 0}
        }
    reducejs = """
        function(obj,prev) { 
            var age = %(now)d - obj.%(event)s;
            var start = %(start)d;
            var end = %(end)d;

            var authSlice = function(timerange) {
              if (obj.auth === 'password') { 
                prev.private[timerange]++; 
              } else { 
                prev.public[timerange]++; 
              }
              prev.total[timerange]++;
            }

            // Totals
            if (obj.apps && obj.apps.length > 0) {
              if (0 < age && age < 3600*24) { authSlice('day'); }
              if (0 < age && age < 3600*24*7) { authSlice('week'); }
              if (0 < age && age < 3600*24*7*4) { authSlice('month'); }
              if (start != 0 && start < obj.%(event)s && obj.%(event)s < end) { authSlice('custom'); }
              authSlice('total');
            }
        }
    """ % {'now': reference_date, 'event': event, 'start': start, 'end': end}

    res = col.group(key, condition, initial, reducejs)
    return shared_user_data(db, res, start=start)

def user_snapshot(reference_date):
  col = state.db['expr']
  key={"owner": 1}
  condition = {'apps': {'$exists': True}, 'created': {'$lt': reference_date}}
  initial = {"total": 0, "private": 0, "public": 0, "expressions": []}
  reducejs =  """
    function(obj, prev) {
        prev.expressions.push(obj['_id']);
        if (obj.apps.length > 0) {
          if (obj.auth === 'password') { 
            prev.private++; 
          } else { 
            prev.public++; 
          }
          prev.total++;
        }
    };
  """
  res = col.group(key, condition, initial, reducejs)
  return shared_user_data(res)

def user_snapshot_load():
  current_time = start_time = time.mktime(datetime.date(2011,1,1).timetuple())
  end_time = time.time()
  while current_time <= end_time:
    snapshot = user_snapshot(current_time)
    state.db.user_snapshot.insert({"date": current_time, "snapshot": snapshot})
    current_time += 60*60*24

def user_first_month(db, reference_date=time.time()):
    res = []
    oldest_missing_first_month = db.User.find({'analytics.first_month.total': {'$exists': False}}, sort=[('created', 1)])['created']
    print oldest_missing_first_month
    for u in db.User.search({'created': {"$lt": reference_date - 30 * 24 * 60 * 60, "$gte": oldest_missing_first_month}}):
        exprs = db.Expr.search({'created': {"$lt": u['created'] + 30 * 24 * 60 * 60}, 'owner': u.id})
        public = filter(lambda x: x.get('auth') == 'public', exprs)
        u.update_cmd({'$unset': {'analytics.first_month.expressions.all': True}, '$set': {'analytics.first_month.expressions.total': len(exprs), 'analytics.first_month.expressions.public': len(public), 'analytics.first_month.expressions.private': len(exprs) - len(public) }})

def app_count(db):
    exprs = db.Expr.search({'apps': {'$exists': True}})
    rv = {'expr_count': exprs.count()}
    for e in exprs:
        if not e.get('apps'): continue
        for app in e.get('apps'):
            type = app.get('type')
            if not type: continue
            if type == 'hive.html':
                if re.search(r'player\.swf', app.get('content')): type = 'mp3'
            if rv.has_key(type):
                rv[type] = rv[type] + 1
            else:
                rv[type] = 1
    return rv

def funnel2(db, start_datetime, end_datetime):
    #GA seems to use dates inclusively, so instead of ending on Feb 1, end on Jan 31
    ga_end_datetime = end_datetime - pandas.DateOffset(days=1)

    # convert datetime into epoch
    start = time.mktime(start_datetime.timetuple())
    end = time.mktime(end_datetime.timetuple())
    avg_users = (db.user.find({'created': {'$lt': start}}).count() + db.user.find({'created': {'$lt': end}}).count()) / 2

    user_ids = [user['_id'] for user in db.user.find({'created': {'$lt': end}}, {'_id': True})]
    exprs0 = db.expr.find({'created': {'$lt': start}, 'owner': {'$in': user_ids}, 'apps': {'$exists': True}}).count()
    user_ids = [user['_id'] for user in db.user.find({'created': {'$lt': start}}, {'_id': True})]
    exprs1 = db.expr.find({'created': {'$lt': end}, 'owner': {'$in': user_ids}, 'apps': {'$exists': True}}).count()
    avg_exprs = (exprs0 + exprs1) / 2

    db.contact_log.find({}).count()
    signups = db.contact_log.find({'url': re.compile('[a-zA-Z0-9_]+\.thenewhive.com/(?!expressions)'), 'created': {'$lt': end, '$gt': start}})

    referral_ids = [s.get('referral_id') for s in signups]
    accounts_created = db.referral.find({'_id': {'$in': referral_ids}, 'user_created': {'$exists': True}})

    ga = oauth.GAClient()
    views = ga.find_one({
        'start_date': start_datetime.strftime("%Y-%m-%d")
        , 'end_date': ga_end_datetime.strftime("%Y-%m-%d")
        , 'metrics': 'ga:pageviews'
        , 'filters': oauth.ga_filters['expressions']
        })
    return {'users': avg_users
            , 'expressions': avg_exprs
            , 'signups': signups.count()
            , 'new_accounts': accounts_created.count()
            , 'views': int(views['ga:pageviews'])
    }

def contacts_per_hour(db, end=now()):
    end = datetime.datetime.fromtimestamp(end)
    end = end.replace(hour=8, minute=0, second=0, microsecond=0)
    hourly = pandas.DateRange(end=end, offset=pandas.DateOffset(hours=24), periods=30)
    contacts = db.contact_log.find({'created':{'$gt': time.mktime(hourly[0].timetuple())}}, {'created': True})
    contact_times = sorted([datetime.datetime.utcfromtimestamp(c['created']) for c in contacts])
    data = pandas.Series(1, contact_times)
    data = pandas.Series(data.groupby(hourly.asof).sum())

    return {  'times': [time.mktime(x.timetuple()) for x in data.index.tolist()]
            , 'values': data.values.tolist()
            }

def datetime_to_int(dt):
    return int(time.mktime(dt.timetuple()))

def datetime_to_str(dt):
    return str(datetime_to_int(dt))


def visits_per_month(db, cohort_users = None, year=None, month=None, force={}):
    if not cohort_users:
        cohort_users = _cohort_users(db)
    cohort_users = cohort_users['names']

    map1 = """
        function() {
            date = new Date((this.created - 12*3600) * 1000);
            day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12);
            emit({name: this.user_name, date: day/1000}, 1);
        }"""

    map2 = """
        function() {
            emit(this._id.name, 1);
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
    mr1 = db.mdb[mr1_name]
    if mr1.count() == 0 or force.has_key(1):
        logger.info("Performing map reduce stage 1")
        mr_collection = db.ActionLog._col.map_reduce(map1, reduce, mr1_name)
    else:
        logger.info("Using cached map reduce stage 1")

    if year and month:
        monthly_range = pandas.DateRange(datetime.datetime(year,month,1,12)
                                         , periods = 1
                                         , offset = pandas.DateOffset(months=1)
                                         )
    else:
        monthly_range = pandas.DateRange(datetime.datetime(2011,11,1,12)
                                         , end = datetime.datetime.now()
                                         , offset = pandas.DateOffset(months=1)
                                         )

    mr2_dict = OrderedDict()
    for date in monthly_range:
        logger.info("Visits per month for %s", date)
        mr2_name = 'mr.visits_per_month.' + datetime_to_str(date)
        mr2 = db.mdb[mr2_name]
        current_month = date + pandas.DateOffset(months=1) > datetime.datetime.now()
        if mr2.count() == 0 or (force.has_key(1) and current_month) or force.has_key(2):
            logger.info("Performing map reduce stage 2")
            query = {'_id.date': {
                        '$gt': datetime_to_int(date)
                        , '$lt': datetime_to_int(date + pandas.DateOffset(months=1))
                        }}
            mr2 = mr1.map_reduce(map2, reduce, mr2_name, query=query)
        else:
            logger.info("Using cached map reduce stage 2")
        mr2_dict[date] = mr2

    return _cohort_analysis(cohort_users, mr2_dict, {'value': {'$gte': 2}})

def expressions_per_month(db, cohort_users = None, year=None, month=None):
    if not cohort_users:
        cohort_users = _cohort_users(db)
    cohort_users = cohort_users['ids']

    map1 = """
        function() {
            if (typeof(this.apps) != "undefined" && this.apps.length > 0){
                emit(this.owner, 1);
            }
        }"""

    reduce = """
        function(key, values) {
            var total=0;
            for (var i=0; i < values.length; i++) {
                total += values[i];
            }
            return total;
        }"""

    if year and month:
        monthly_range = pandas.DateRange(datetime.datetime(year,month,1,12)
                                         , periods = 1
                                         , offset = pandas.DateOffset(months=1)
                                         )
    else:
        monthly_range = pandas.DateRange(datetime.datetime(2011,4,1,12)
                                         , end = datetime.datetime.now()
                                         , offset = pandas.DateOffset(months=1)
                                         )

    mr_dict = _monthly_map_reduce(db, monthly_range, db.mdb.expr, 'created', map1, reduce, 'expressions_per_month')
    return _cohort_analysis(cohort_users, mr_dict, {'value': {'$gte': 1}})

def referrals_per_month(db, cohort_users = None, year=None, month=None):
    if not cohort_users:
        cohort_users = _cohort_users(db)
    cohort_users = cohort_users['ids']

    map = """
        function() {
            emit(this.user, 1);
        }
        """

    if year and month:
        monthly_range = pandas.DateRange(datetime.datetime(year,month,1,12)
                                         , periods = 1
                                         , offset = pandas.DateOffset(months=1)
                                         )
    else:
        monthly_range = pandas.DateRange(datetime.datetime(2011,4,1,12)
                                         , end = datetime.datetime.now()
                                         , offset = pandas.DateOffset(months=1)
                                         )

    mr_dict = _monthly_map_reduce(db, monthly_range, db.mdb.referral, 'created', map, None, 'referrals_per_month')
    return _cohort_analysis(cohort_users, mr_dict, {'value': {'$gte': 1}})

def used_referrals_per_month(db, cohort_users = None, year=None, month=None):
    if not cohort_users:
        cohort_users = _cohort_users(db)
    cohort_users = cohort_users['ids']

    map = """
        function() {
            if (this.used) {
                emit(this.user, 1);
            }
        }
        """

    if year and month:
        monthly_range = pandas.DateRange(datetime.datetime(year,month,1,12)
                                         , periods = 1
                                         , offset = pandas.DateOffset(months=1)
                                         )
    else:
        monthly_range = pandas.DateRange(datetime.datetime(2011,4,1,12)
                                         , end = datetime.datetime.now()
                                         , offset = pandas.DateOffset(months=1)
                                         )

    mr_dict = _monthly_map_reduce(db, monthly_range, db.mdb.referral, 'created', map, None, 'used_referrals_per_month')
    return _cohort_analysis(cohort_users, mr_dict, {'value': {'$gte': 1}})

def funnel2_per_month(db, cohort_users = None, year=None, month=None):
    if not cohort_users:
        cohort_users = _cohort_users(db)
    cohort_users = cohort_users['names']

    map = """
        function() {
            if (this.url ) {
                emit(this.url.match(/([a-zA-Z0-9]+)?.?(thenewhive.com)/)[1], 1);
            }
        }"""

    if year and month:
        monthly_range = pandas.DateRange(datetime.datetime(year,month,1,12)
                                         , periods = 1
                                         , offset = pandas.DateOffset(months=1)
                                         )
    else:
        monthly_range = pandas.DateRange(datetime.datetime(2011,4,1,12)
                                         , end = datetime.datetime.now()
                                         , offset = pandas.DateOffset(months=1)
                                         )

    mr_dict = _monthly_map_reduce(db, monthly_range, db.mdb.contact_log, 'created', map, None, 'funnel2_per_month')
    return _cohort_analysis(cohort_users, mr_dict, {'value': {'$gte': 1}})

def _monthly_map_reduce(db, months, collection, date_key, map, reduce, name, force=False):
    if not reduce:
        reduce = """
        function(key, values) {
            var total=0;
            for (var i=0; i < values.length; i++) {
                total += values[i];
            }
            return total;
        }"""

    mr_dict = OrderedDict()
    for date in months:
        mr_name = '.'.join(('mr', name, datetime_to_str(date)))
        mr = db.mdb[mr_name]
        current_month = date + pandas.DateOffset(months=1) > datetime.datetime.now()
        if force or mr.count() == 0 or current_month:
            logger.info("Performing map reduce")
            query = {date_key: {
                        '$gt': datetime_to_int(date)
                        , '$lt': datetime_to_int(date + pandas.DateOffset(months=1))
                        }}
            mr = collection.map_reduce(map, reduce, mr_name, query=query)
        mr_dict[date] = mr

    return mr_dict

def _cohort_analysis(cohorts, mr_dict, condition):
    rv = OrderedDict()
    for cohort_name, users in cohorts.iteritems():
        if mr_dict.keys()[-1] >= cohort_name:
            rv[cohort_name] = OrderedDict()
        condition.update({'_id': {'$in': users}})
        for mr_name, mr in mr_dict.iteritems():
            incomplete = mr_name + pandas.DateOffset(months=1) > datetime.datetime.now()
            if mr_name >= cohort_name:
                cohort_size = float(len(users))
                active_count = float(mr.find(condition).count())
                rv[cohort_name][mr_name] = {'size': cohort_size
                                             , 'active': active_count
                                             , 'active_fraction': active_count / cohort_size
                                             , 'incomplete': incomplete}
    return rv


def _cohort_users(db, stop_date=datetime.datetime.now()):
    cohort_range = pandas.DateRange(start = datetime.datetime(2011,4,1,12)
                               , end = stop_date
                               , offset = pandas.DateOffset(months=1)
                               )

    cohort_users = {'names': OrderedDict(), 'ids': OrderedDict()}
    for date in cohort_range:
        cohort_users['names'][date] = []
        cohort_users['ids'][date] = []
        for u in db.User.search({
                        'created': {
                            '$gt': datetime_to_int(date)
                            , '$lt': datetime_to_int(date + pandas.DateOffset(months=1))
                            }
                        }):
            cohort_users['names'][date].append(u['name'])
            cohort_users['ids'][date].append(u.id)
    return cohort_users



if __name__ == '__main__':
    from newhive.state import Database
    import newhive.config
    db = Database(newhive.config)
    ch = logging.StreamHandler()
    ch.setLevel(logging.debug)
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s')
    ch.setFormatter(formatter)
    logger.addHandler(ch)
