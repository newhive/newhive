# not tested at all

from newhive import state, config
import collections, operator
db = state.Database(config)

views_by_user = collections.Counter()
for e in db.Expr.search({}): views_by_user[ e.owner['name'] ] += e.views()
views = sorted(views_by_user.iteritems(), key=operator.itemgetter(1), reverse=True)

with open('total_views.txt', 'w') as f:
    for user, views in views: print(user + ' ' + str(views) + '\n')
