from newhive.utils import *
from newhive import config, state

db = state.Database(config)

def time_range(start, end):
    return { '$gt': time_s(start), '$lt': time_s(end) }

def month_range(year, month):
    return time_range(datetime(year, month, 01), datetime(year, month + 1, 1))

def users_from(year, month):
    return [u.id for u in db.User.search({'created':month_range(year, month)})]

months = [(2011, n) for n in range(6, 12)] + [(2012, n) for n in range(1, 4)]

def analyze(span):
    data = []
    data.append(['cohort', 'cohort size', 'start date', 'end date', 'action', 'users', 'count'])
    views_start = time_s(datetime(2011, 12, 07)) # view logging started then

    end = now()
    for month in months:
        ch = users_from(*month)
        range_start = time_s(datetime(*month + (1,)))
        while True:
            range_end = range_start + 86400 * span
            if range_end > end: break

            time_spec = time_range(range_start, range_end)
            row = [str(month[0]) + '-' + str(month[1]), len(ch), str(time_u(range_start).date()), str(time_u(range_end).date())]

            c = db.Expr.search({ 'created': time_spec, 'owner': {'$in': ch} })
            data.append(row + [
                'create',
                len(c.distinct('owner')),
                c.count()
            ])

            if range_start > views_start:
                c = db.ActionLog.search({ 'action':'view_expression', 'created': time_spec, 'user': {'$in': ch} })
                data.append(row + [
                    'view',
                    len(c.distinct('user')),
                    c.count()
                ])

            range_start += 86400 * span

    return data

dd = analyze(1)
with open('/tmp/cohort_activity_daily.csv', 'w') as f: csv.writer(f).writerows(dd)
dw = analyze(7)
with open('/tmp/cohort_activity_weekly.csv', 'w') as f: csv.writer(f).writerows(dw)
dm = analyze(30)
with open('/tmp/cohort_activity_monthly.csv', 'w') as f: csv.writer(f).writerows(dm)
