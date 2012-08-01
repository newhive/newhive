from werkzeug import exceptions
from newhive import config, oauth
from newhive.utils import junkstr
from newhive.oauth import FacebookClient, FlowExchangeError
import newhive.ui_strings.en as ui

import logging
logger = logging.getLogger(__name__)

def authenticate_request(db, request, response):
    """Read session id from 'identity' cookie, retrieve session record from db,
       compare session secret with plain_secret or secure_secret, returns
       state.User object."""

    sessid = get_cookie(request, 'identity')
    fail = db.User.new({})
    if not sessid: return fail
    session = db.Session.fetch(sessid)
    if not session: return fail
    user = db.User.fetch(session['user'])
    if not user:
        rm_cookie(response, 'plain_secret')
        rm_cookie(response, 'secure_secret', True)
        rm_cookie(response, 'identity')
        return fail

    user.update(session = session.id)

    user.logged_in = False
    if cmp_secret(session, request, response):
        user.logged_in = True
    return user

def handle_login(db, request, response):
    """Reads username and password from POST data, creates session,
       sets request.requester to state.User object, returns True if login succeeds"""

    args = request.form
    if not request.is_secure: raise exceptions.BadRequest()
    username = args.get('username', False).lower()
    secret = args.get('secret', False)
    if username and secret:
        user = db.User.named(username)
        if not user: user = db.User.find({'email': username})
        if user and user.cmp_password(secret):
            new_session(db, user, request, response)
            return True

    response.context['error'] = 'Invalid username or password'
    return False

def facebook_login(db, request, response):
    request.fbc = oauth.FacebookClient()
    try:
        fb_profile = request.requester.fb_client.me()
        user = db.User.find_by_facebook(fb_profile.get('id'))
    except FlowExchangeError as e:
        logger.error("Flow exchange error during facebook login: %s", e)
        user = None
        response.context['error'] = ui.facebook_flow_exhange_error

    if user:
        session = new_session(db, user, request, response)
        user.update(session = session.id)
        user.logged_in = True
        return user
    else:
        return request.requester

def new_session(db, user, request, response):
    # login

    # session record looks like:
    #    user = id
    #    expires = bool
    #    remember = bool
    #    plain_secret = str
    #    secure_secret = str

    expires = False if request.form.get('no_expires', False) else True
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
    request.requester = user
    return session

def handle_logout(db, request, response):
    """Removes cookies, deletes session record, sets
       request.requester.logged_in to False"""
    session = db.Session.fetch(request.requester['session'])

    rm_cookie(response, 'plain_secret')
    rm_cookie(response, 'secure_secret', True)

    if session['remember']:
        session.update(active = False)
    else:
        rm_cookie(response, 'identity')
        session.delete()

    request.requester.logged_in = False

def password_change(request, response, force=False):
    args = request.form
    new_password = args.get('password', False)
    user = request.requester
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
        #set_secret(session, secure, response)
        return True
    return False # Cookies are funky, but just return false and let the user login again.

import datetime
def set_cookie(response, name, data, secure = False, expires = True):
    expiration = None if expires else datetime.datetime(2100, 1, 1)
    max_age = 0 if expires else None
    response.set_cookie(name, value = data, secure = secure,
        # no longer using subdomains
        #domain = None if secure else '.' + config.server_name, httponly = True,
        expires = expiration)
def get_cookie(request, name): return request.cookies.get(name, False)
def rm_cookie(response, name, secure = False): response.delete_cookie(name,
    domain = None if secure else '.' + config.server_name)
