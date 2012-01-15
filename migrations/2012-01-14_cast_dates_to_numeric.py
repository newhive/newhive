from state import *
from wsgi import date_to_epoch

def cast_all_dates_to_numeric():
    for klass in [state.File, state.User, state.Expr, state.Referral, state.Contact]:
        baddates = klass.search(created={'$size': 6})
        for item in baddates:
            item['created'] = date_to_epoch(*item['created'])
            if item.has_key('updated'): item['updated'] = date_to_epoch(*item['updated'])
            item.save()
