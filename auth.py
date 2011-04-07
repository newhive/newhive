import random
import config
from werkzeug import exceptions
from state import User, Session

def authenticate_request(request, response):
    sessid = get_cookie(request, 'identity')
    if not sessid: return {}
    session = get('session', sessid)
    if not session: return {}
    uinfo = User.fetch(session['user'])

    verified = False
    client_secret = get_cookie(request, secrets[request.is_secure])
    if client_secret:
        if client_secret == session[secrets[request.is_secure]]
            verified = True
            #set_secret(uinfo, request.is_secure, response)
        else: return BadCookie()

    return (uinfo, verified)

def handle_login(request, response):
    if not request.is_secure: return exceptions.BadRequest()
    user = request.form.get('username', False)
    secret = request.form.get('secret', False)
    if not (user or secret): return exceptions.BadRequest()

    uinfo = User.fetch(user)
    if uinfo and User.cmp_password(secret):
        request.requester = login(user, response)
        return
    response.context['error'] = 'Invalid username or password'

def handle_logout(request, response):
    uinfo = request.requester
    if not uinfo: return
    if not request.is_secure: return exceptions.BadRequest()
    logout(uinfo['home'], response)
    uinfo.clear()

def login(user, response):
    uinfo = User.fetch(user)
    set_cookie(response, 'identity', uinfo)
    [ set_secret(uinfo, is_secure, response) for is_secure in [True, False]]
    return uinfo
#class Session(Entity):
#    user = ManyToOne('state.User')
#    created = Field(DateTime)
#    expires = Field(DateTime)
#    remember = Field(Boolean)
#    key_plain = Field(String())
#    key_secure = Field(String())
#

def pwd2uinfo(pw_struct):
    uinfo = { 'username' : pw_struct.pw_name, 'uid' : pw_struct.pw_uid,
        'home' : pw_struct.pw_dir, 'gid' : pw_struct.pw_gid }

    user_config = user_state_get(uinfo['home'], 'uinfo')
    if not user_config:
        fullname = pw_struct.pw_gecos.split(',')[0] or uinfo['username']
        user_config = { 'name' : fullname }
        user_state_set(uinfo['home'], 'uinfo', user_config)
    for k in user_config: uinfo[k] = user_config[k]

    return uinfo


def info_name(user): return pwd2uinfo(pwd.getpwnam(user))
def info_uid(user): return pwd2uinfo(pwd.getpwuid(user))

secrets = ['plain_secret', 'secure_secret']
cookies = secrets + ['identity']

def logout(home, response):
    for name in ['identity', 'plain_secret']: rm_cookie(response, name)
    rm_cookie(response, 'secure_secret', True)
    for snam in secrets: user_state_del(home, snam)
    return None

#class Session(Entity):
#    user = ManyToOne('state.User')
#    created = Field(DateTime)
#    expires = Field(DateTime)
#    remember = Field(Boolean)
#    key_plain = Field(String())
#    key_secure = Field(String())
#


def user_state(home, name): #return join(home, '.hive', name)
def user_state_get(home, name):
    #try: return json.load(open(user_state(home, name)))
    #except: return None
def user_state_set(home, name, val):
    #f = open(user_state(home, name), 'w')
    #except:
    #    os.mkdir(join(home, '.hive'))
    #    f = open(user_state(home, name))
    #os.fchmod(f.fileno(), 0660)
    #json.dump(val, f)
def user_state_del(home, name): #os.remove(user_state(home, name))

def set_secret(uinfo, is_secure, response):
    secret = junkstr()
    user_state_set(uinfo['name'], secrets[is_secure], secret)
    set_cookie(response, secrets[is_secure], secret, secure = is_secure)

# the ugly PAM part
def check_password(user, secret):
    auth = PAM.pam()
    auth.start('passwd')
    auth.set_item(PAM.PAM_USER, user)
    auth.set_item(PAM.PAM_CONV, lambda a, b, c: [(secret, 0)])
    try:
        auth.authenticate()
        auth.acct_mgmt()
    except PAM.error, resp: return resp.args
    else: return False

def junkstr(): return ''.join(map(chr, [random.randrange(0, 128) for n in range(32)]))

def set_cookie(response, name, data, secure = False):
    response.set_cookie(name, value = data,
        domain = None if secure else '.' + config.server_name, httponly = True)
def get_cookie(request, name): return request.cookies.get(name, '{}')
def rm_cookie(response, name, secure = False): response.delete_cookie(name,
    domain = None if secure else '.' + config.server_name)

class BadCookie(exceptions.BadRequest):
    def get_body(self, environ):
        return "there's some funky cookie business going on"
