from werkzeug import exceptions
from newhive import config, oauth
from newhive.utils import junkstr, set_cookie, get_cookie, rm_cookie
from newhive.oauth import FacebookClient, FlowExchangeError
import newhive.ui_strings.en as ui

import logging
logger = logging.getLogger(__name__)

def authenticate_request(db, request, response):
    """Read session id from 'identity' cookie, retrieve session record from db,
       compare session secret with plain_secret or secure_secret.
       If session not found and credentials given, creates session.
       returns state.User object, False when there's no session,
       or Exception on login failure."""

    session = db.Session.fetch(get_cookie(request, 'identity'))
    if not session or not session.get('active'):
        return handle_login(db, request, response)
    user = db.User.fetch(session['user'])
    user.logged_in = False
    if cmp_secret(session, request, response):
        user.logged_in = True
    return user

def handle_login(db, request, response):
    """Reads username and password from POST data, creates session,
       returns authenticated state.User on success, False on failure."""

    args = request.form
    username = args.get('username', '').lower()
    secret = args.get('secret', False)
    if username and secret:
        if not request.is_secure: raise exceptions.BadRequest()
        user = db.User.named(username)
        if not user: user = db.User.find({'email': username})
        if user and user.cmp_password(secret):
            new_session(db, user, request, response)
            user.logged_in = True
            return user
        else:
            return Exception('Invalid credentials')
    return False

def new_session(db, user, request, response):
    # login

    # session record looks like:
    #    user = id
    #    expires = bool
    #    remember = bool
    #    plain_secret = str
    #    secure_secret = str

    expires = request.form.get('expires', False)
    session = db.Session.create(dict(
         user = user.id
        ,active = True
        ,remember = request.form.get('remember', False)
        ,expires = expires
        ))
    set_secret(session, True, response)
    set_secret(session, False, response)
    set_cookie(response, 'identity', session.id, expires = expires)
    user.logged_in = True
    user.update(session = session.id)
    return session

def handle_logout(db, user, request, response):
    """Removes cookies, deletes session record."""

    session = db.Session.fetch(user['session'])

    rm_cookie(response, 'plain_secret')
    rm_cookie(response, 'secure_secret', True)

    user.logged_in = False

    if not session: return False # already logged out
    if session.get('remember'):
        session.update(active = False)
    else:
        rm_cookie(response, 'identity')
        session.delete()
    return True # Everything logged out

def password_change(user, request, response, force=False):
    args = request.form
    new_password = args.get('password', False)
    if not request.is_secure or not (user and new_password):
        raise exceptions.BadRequest()
    if not force:
        secret = args.get('old_password', False)
        if not user.cmp_password(secret): return False
    user.set_password(new_password)
    user.save()
    return True

secrets = ['plain_secret', 'secure_secret']
cookies = secrets + ['identity']

def set_secret(session, is_secure, response):
    secret = junkstr(32)
    session.update(**{ secrets[is_secure] : secret })
    set_cookie(response, secrets[is_secure], secret, secure = is_secure, expires = session['expires'])
def cmp_secret(session, request, response):
    secure = True
    client_secret = get_cookie(request, secrets[secure])
    if not client_secret:
        secure = False
        client_secret = get_cookie(request, secrets[secure])
    if not client_secret: return False
    if client_secret == session[secrets[secure]]:
        # creating fresh secret with each request causes problems
        # occasionally, not really sure why, so disabled for now
        #set_secret(session, secure, response)
        return True
    return False # Cookies are funky, but just return false and let the user login again.
