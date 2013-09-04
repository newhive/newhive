from newhive import config, state

db = state.Database(config)

def main():
    db.mdb.user.update(
            {}
            , {'$set': {'email_subscriptions': config.default_email_subscriptions}}
            , multi=True
            )
