import state, time, datetime, re

def shared_user_data(result, start=None):
    custom_counts = {}
    for item in result:
      user = state.User.fetch(item['owner'])
      if user:
        item['name'] = user.get('name')
        item['age'] = (time.time() - user['created']) / 3600 /24
        item['updated'] = user['updated']
        if start and start != 0:
            if user['created'] < start: 
                item['include_custom'] = True
                for i in range(int(item['public']['custom'])+1):
                    if custom_counts.has_key(i):
                        custom_counts[i] += 1
                    else:
                        custom_counts[i] = 1
        try:
          item['first_month'] = user['analytics']['first_month']
        except KeyError:
          item['first_month'] = None
      else: item['name'] = item['owner']
    return [result, custom_counts]


def active_users(reference_date=time.time(), event='created', start=0, end=0):
    col = state.db['expr']
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
    return shared_user_data(res, start=start)

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

def user_first_month(reference_date=time.time()):
  res = []
  oldest_missing_first_month = state.db.user.find_one({'analytics.first_month.total': {'$exists': False}}, {'created': 1}, sort=[('created', 1)])['created']
  print oldest_missing_first_month
  for u in map(state.User, state.db.user.find({'created': {"$lt": reference_date - 30 * 24 * 60 * 60, "$gte": oldest_missing_first_month}})):
    exprs = state.Expr.search(created = {"$lt": u['created'] + 30 * 24 * 60 * 60}, owner = u.id)
    public = filter(lambda x: x.get('auth') == 'public', exprs)
    u.update_cmd({'$unset': {'analytics.first_month.expressions.all': True}, '$set': {'analytics.first_month.expressions.total': len(exprs), 'analytics.first_month.expressions.public': len(public), 'analytics.first_month.expressions.private': len(exprs) - len(public) }})

def app_count():
    exprs = state.Expr.search(apps={'$exists': True})
    rv = {'expr_count': len(exprs)}
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
