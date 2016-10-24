mongo db.newhive.com/live --quiet --eval "db.expr.find().forEach(function(r){ print(JSON.stringify(r)) })" -u live -p $(< newhive/config/live_db_secret) > /tmp/exprs.ljson
