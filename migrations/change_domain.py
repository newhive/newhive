from state import *
import config

def update_domain():
    """ Hack for overwriting the TLD on all user and expr records to server_name
    THIS WILL BREAK things when we support multiple domains """

    for e in Expr.search() + User.search(): e.set_tld(config.server_name)
