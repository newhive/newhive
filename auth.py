from werkzeug import exceptions
import config
from state import User, Session, junkstr

def authenticate_request(request, response):
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
    args = request.form
    if not request.is_secure: raise exceptions.BadRequest()
    username = args.get('username', False)
    secret = args.get('secret', False)
    if not (username or secret): raise exceptions.BadRequest()

    user = User.fetch_by_name(username)
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
    if not request.trusting: raise exceptions.BadRequest()
    session = Session.fetch(request.requester['session'])

    rm_cookie(response, 'plain_secret')
    rm_cookie(response, 'secure_secret', True)

    if session['remember']:
        session.update(active = False)
    else:
        rm_cookie(response, 'identity')
        session.delete()

    request.requester.logged_in = False

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
