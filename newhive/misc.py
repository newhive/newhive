import newhive
import newhive.state

def find_failed_facebook_signups(start_date, end_date = None):
    from newhive.wsgi import re, db, uniq, now

    if not end_date: end_date = now()
    regex = re.compile('^FlowExchangeError')
    query = {'exception': regex, 'created': {'$gt': start_date, '$lt': end_date}}
    errors =  db.ErrorLog.search(query)
    urls = [error['url'] for error in errors]
    keys = [url.split('/')[-1].split('?')[0] for url in urls]
    keys = uniq(keys)
    referrals = [db.Referral.find({'key': key, 'used': {'$exists': False}}) for key in keys]
    emails = [ref.get('to') if ref else None for ref in referrals]
    emails = uniq(filter(lambda x: x, emails))
    return emails

class DatabaseCopier(object):

    def __init__(self, db_from, db_to):
        class Object(object): pass
        config = Object()
        for attr in ['database', 'database_host', 'database_port', 'aws_id', 'aws_secret', 's3_buckets']:
            setattr(config, attr, getattr(newhive.config, attr))

        config.database = db_from
        self.db_from = newhive.state.Database(config)

        config.database = db_to
        self.db_to = newhive.state.Database(config)

    def copy_expr(self, tuple_or_id):
        if newhive.utils.is_mongo_key(tuple_or_id):
            expr_from = self.db_from.Expr.fetch(tuple_or_id)
            expr_to = self.db_to.Expr.fetch(tuple_or_id)
        else:
            expr_from = self.db_from.Expr.named(*tuple_or_id)
            expr_to = self.db_to.Expr.named(*tuple_or_id)

        print "copy {expr[title]} - {expr.url} by {expr[owner_name]} updated at {expr[updated]}".format(expr=expr_from)
        print "from {} to {}".format(self.db_from.mdb.name, self.db_to.mdb.name)
        if expr_to:
            print "Expression already exists at destination with updated time {expr[updated]}".format(expr=expr_to)

        if raw_input("y/n: ") == "y":
            self.db_to.Expr.create(expr_from)

def restore_expr_timestamps_from_test():
    db_test = newhive.state.Database(newhive.config, db_name='test')
    db_live = newhive.state.Database(newhive.config, db_name='hive')
    for expr in db_live.Expr.search({}):
        old_expr = db_test.Expr.fetch(expr.id)
        if old_expr and old_expr['updated'] != expr['updated']:
            print expr['owner_name'], expr['name'], old_expr['updated'], expr['updated']
            expr.update(updated=old_expr['updated'])
