from werkzeug import exceptions
from newhive import config
from newhive.state import User, Session, junkstr

def authenticate_request(request, response):
    """Read session id from 'identity' cookie, retrieve session record from db,
       compare session secret with plain_secret or secure_secret, returns
       state.User object."""

    sessid = get_cookie(request, 'identity')
    fail = User({})
    if not sessid: return fail
    session = Session.fetch(sessid)
    if not session: return fail
    user = User.fetch(session['user'])
    user.update(session = session.id)

    user.logged_in = False
    if cmp_secret(session, request, response):
        user.logged_in = True
    return user

def handle_login(request, response):
    """Reads username and password from POST data, creates session,
       sets request.requester to state.User object, returns True if login succeeds"""

    args = request.form
    if not request.is_secure: raise exceptions.BadRequest()
    username = args.get('username', False)
    secret = args.get('secret', False)
    if not (username or secret): raise exceptions.BadRequest()

    user = User.named(username)
    if user and user.cmp_password(secret):
        # login

        # session record looks like:
        #    user = id
        #    expires = bool
        #    remember = bool
        #    plain_secret = str
        #    secure_secret = str

        expires = False if args.get('no_expires', False) else True
        session = Session.create(
             user = user.id
            ,active = True
            ,remember = args.get('remember', False)
            ,expires = expires
            )
        set_secret(session, True, response)
        set_secret(session, False, response)
        set_cookie(response, 'identity', session.id, expires = expires)
        user.logged_in = True
        request.requester = user
        return True

    response.context['error'] = 'Invalid username or password'
    return False

def handle_logout(request, response):
    """Removes cookies, deletes session record, sets
       request.requester.logged_in to False"""
    session = Session.fetch(request.requester['session'])

    rm_cookie(response, 'plain_secret')
    rm_cookie(response, 'secure_secret', True)

    if session['remember']:
        session.update(active = False)
    else:
        rm_cookie(response, 'identity')
        session.delete()

    request.requester.logged_in = False

def password_change(request, response):
    args = request.form
    if not request.is_secure: raise exceptions.BadRequest()
    secret = args.get('old_password', False)
    new_password = args.get('password', False)
    user = request.requester
    if not (user and secret and new_password): raise exceptions.BadRequest()
    if user and user.cmp_password(secret):
        user.set_password(new_password)
        user.save()
        return True
    else: return False

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
    raise BadCookie()

import datetime
def set_cookie(response, name, data, secure = False, expires = True):
    expiration = None if expires else datetime.datetime(2100, 1, 1)
    max_age = 0 if expires else None
    response.set_cookie(name, value = data, secure = secure,
        domain = None if secure else '.' + config.server_name, httponly = True,
        expires = expiration)
def get_cookie(request, name): return request.cookies.get(name, False)
def rm_cookie(response, name, secure = False): response.delete_cookie(name,
    domain = None if secure else '.' + config.server_name)

class BadCookie(exceptions.BadRequest):
    def get_body(self, environ):
        return "there's some funky cookie business going on"
