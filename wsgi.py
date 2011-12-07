#!/usr/bin/env python
# Copyright 2011, Abram Clark & A Reflection Of LLC
# thenewhive.com WSGI server version 0.2

import os, re, json, mimetypes, math
from datetime import datetime
from os.path  import dirname, exists, join as joinpath
from werkzeug import Request, Response, exceptions, url_unquote
from urlparse import urlparse
import jinja2
import PIL.Image as Img
from PIL import ImageOps

import config, auth
from colors import colors
from state import Expr, File, User, Contact, Referral, DuplicateKeyError, time_u, normalize, get_root, abs_url, Comment, Star, ActionLog
import ui_strings.en as ui

import webassets

assets_env = webassets.Environment(joinpath(config.src_home, 'libsrc'), '/lib')
if config.webassets_debug:
    assets_env.debug = True
    assets_env.updater = "always"
    assets_env.set_url('/lib/libsrc')
assets_env.register('edit.js', 'filedrop.js', 'upload.js', 'editor.js', filters='yui_js', output='../lib/edit.js')
assets_env.register('app.js', 'jquery.js', 'jquery_misc.js', 'rotate.js', 'hover.js',
    'drag.js', 'dragndrop.js', 'colors.js', 'util.js', filters='yui_js', output='../lib/app.js')

assets_env.register('admin.js', 'raphael/raphael.js', 'raphael/g.raphael.js', 'raphael/g.pie.js', 'jquery.tablesorter.min.js', 'jquery-ui/jquery-ui-1.8.16.custom.min.js', output='../lib/admin.js')
assets_env.register('admin.css', 'jquery-ui/jquery-ui-1.8.16.custom.css', output='../lib/admin.css')

assets_env.register('app.css', 'app.css', filters='yui_css', output='../lib/app.css')
assets_env.register('base.css', 'base.css', filters='yui_css', output='../lib/base.css')
assets_env.register('editor.css', 'editor.css', filters='yui_css', output='../lib/editor.css')
assets_env.register('expression.js', 'expression.js', filters='yui_js', output='../lib/expression.js')



def lget(L, i, *default):
    try: return L[i]
    except: return default[0] if default else None
def raises(e): raise e
def dfilter(d, keys):
    """ Accepts dictionary and list of keys, returns a new dictionary
        with only the keys given """
    r = {}
    for k in keys:
        if k in d: r[k] = d[k]
    return r


def expr_save(request, response):
    """ Parses JSON object from POST variable 'exp' and stores it in database.
        If the name (url) does not match record in database, create a new record."""

    try: exp = Expr(json.loads(request.form.get('exp', '0')))
    except: exp = False
    if not exp: raise ValueError('missing or malformed exp')

    res = Expr.fetch(exp.id)
    upd = dfilter(exp, ['name', 'domain', 'title', 'apps', 'dimensions', 'auth', 'password', 'tags', 'background', 'thumb'])
    upd['name'] = upd['name'].lower().strip()

    # if user has not picked a thumbnail, pick the latest image added
    if not ((res and res.get('thumb')) or exp.get('thumb') or exp.get('thumb_src')):
        fst_img = lget(filter(lambda a: a['type'] == 'hive.image', exp.get('apps', [])), -1)
        if fst_img and fst_img.get('content'): exp['thumb_src'] = fst_img['content']
    # Generate thumbnail from given image url
    if exp.get('thumb_src'): upd['thumb'] = generate_thumb_from_url(request.requester, exp.get('thumb_src'), size=(124,96))

    if not exp.id or upd['name'] != res['name'] or upd['domain'] != res['domain']:
        try:
          new_expression = True
          res = request.requester.expr_create(upd)
          ActionLog.new(request.requester, "new_expression_save", data={'expr_id': res.id})
          request.requester.flag('expr_new')
          if request.requester.get('flags').get('add_invites_on_save'):
              request.requester.unflag('add_invites_on_save')
              request.requester.give_invites(5)
        except DuplicateKeyError:
            if exp.get('overwrite'):
                Expr.named(upd['domain'], upd['name']).delete()
                res = request.requester.expr_create(upd)
                ActionLog.new(request.requester, "new_expression_save", data={'expr_id': res.id, 'overwrite': True})
            else:
                return { 'error' : 'overwrite' } #'An expression already exists with the URL: ' + upd['name']
                ActionLog.new(request.requester, "new_expression_save_fail", data={'expr_id': res.id, 'error': 'overwrite'})
    else:
        if not res['owner'] == request.requester.id:
            raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
        res.update(**upd)
        new_expression = False
        ActionLog.new(request.requester, "update_expression", data={'expr_id': res.id})
    return dict( new=new_expression, error=False, id=res.id, location=abs_url(domain = upd['domain']) + upd['name'] )

import urllib, random
def generate_thumb_from_url(owner, url, size):
    # create file record in database, copy file to media directory via http
    try: response = urllib.urlopen(url)
    except: return
    if response.getcode() != 200: return
    mime = response.headers.getheader('Content-Type')

    path = os.tmpnam()
    f = open(path, 'w')
    f.write(response.read())
    f.close()
    return generate_thumb(owner, path, size)

def generate_thumb(owner, path, size):
    # resize and crop image to size set by size tuple, preserving aspect ratio, save over original
    try: imo = Img.open(path)
    except:
        os.remove(path)
        return False
    imo = ImageOps.fit(imo, size=size, method=Img.ANTIALIAS, centering=(0.5, 0.5))
    imo = imo.convert(mode='RGB')
    imo.save(path, format='jpeg', quality=70)

    res = File.create(owner=owner.id, path=path, size=size, name='thumb', mime='image/jpeg')
    return res.get('url')


def expr_delete(request, response):
    e = Expr.fetch(request.form.get('id'))
    if not e: return serve_404(request, response)
    if e['owner'] != request.requester.id: raise exceptions.Unauthorized('Nice try. You no edit stuff you no own')
    e.delete()
    if e['name'] == '': request.requester.expr_create({ 'title' : 'Homepage', 'home' : True })
    # TODO: garbage collect media files that are no longer referenced by expression
    return redirect(response, home_url(request.requester))

def files_create(request, response):
    """ Saves a file uploaded from the expression editor, responds
    with a Hive.App JSON object.
    Resamples images to 1600x1000 or smaller, sets JPEG quality to 70
    """

    request.max_content_length = 100000000

    # TODO: separate image optimization from file upload logic
    for file_name in request.files:
        file = request.files[file_name]
        mime = mimetypes.guess_type(file.filename)[0]

        app = {}
        if mime == 'text/plain':
            app['type'] = 'hive.text'
            app['content'] = file.stream.read()
            return app

        path = os.tmpnam()
        file.save(path)

        if mime in ['image/jpeg', 'image/png', 'image/gif']:
            try: imo = Img.open(path)
            except:
                res.delete()
                return False
            if imo.size[0] > 1600 or imo.size[1] > 1000:
                ratio = float(imo.size[0]) / imo.size[1]
                new_size = (1600, int(1600 / ratio)) if ratio > 1.6 else (int(1000 * ratio), 1000)
                imo = imo.resize(new_size, resample=Img.ANTIALIAS)
            opts = {}
            if mime == 'image/jpeg': opts.update(quality = 70, format = 'JPEG')
            if mime == 'image/png': opts.update(optimize = True, format = 'PNG')
            if mime == 'image/gif': opts.update(format = 'GIF')
            imo.save(path, **opts)

        res = File.create(owner=request.requester.id, path=path, name=file.filename, mime=mime)
        url = res.get('url')
        app['file_id'] = res.id

        if mime in ['image/jpeg', 'image/png', 'image/gif']:
            app['type'] = 'hive.image'
            app['content'] = url
        elif mime == 'audio/mpeg':
            app['content'] = ("<object type='application/x-shockwave-flash' data='/lib/player.swf' width='100%' height='24'>"
                +"<param name='FlashVars' value='soundFile=" + url + "'>"
                +"<param name='wmode' value='transparent'></object>"
                )
            app['type'] = 'hive.html'
            app['dimensions'] = [200, 24]
        else:
            app['type'] = 'hive.text'
            app['content'] = "<a href='%s'>%s</a>" % (url, file.filename)

        return app

def file_delete(request, response):
    res = File.fetch(request.form.get('id'))
    if res: res.delete()
    return True


def user_check(request, response):
    return False if User.named(request.args.get('name')) else True

def user_create(request, response):
    """ Checks if the referral code matches one found in database.
        Decrements the referral count of the user who created the referral and checks if the count is > 0.
        Creates user record.
        Creates empty home expression, so user.thenewhive.com does not show 404.
        Creates media directory for user.
        emails thank you for registering to user
        Logs new user in.
        """

    referral = Referral.fetch(request.args.get('key'), keyname='key')
    if (not referral or referral.get('used')): return bad_referral(request, response)
    referrer = User.fetch(referral['user'])
    assert 'tos' in request.form

    args = dfilter(request.form, ['name', 'password', 'email', 'fullname'])
    args.update({
         'referrer' : referral['user']
        ,'sites'    : [args['name'].lower() + '.' + config.server_name]
        ,'flags'    : { 'add_invites_on_save' : True }
    })
    user = User.create(**args)
    referrer.update(referrals = referrer['referrals'] - 1)
    referral.update(used=True, user_created=user.id, user_created_name=user['name'], user_created_date=user['created'])
    home_expr = user.expr_create({ 'title' : 'Homepage', 'home' : True })

    try: mail_user_register_thankyou(user)
    except: pass # TODO: log an error

    request.form = dict(username = args['name'], secret = args['password'])
    login(request, response)
    return redirect(response, abs_url(subdomain=config.site_user) + config.site_pages['welcome'])

def no_more_referrals(referrer, request, response):
    response.context['content'] = 'User %s has no more referrals' % referrer
    return serve_page(response, 'pages/minimal.html')
def bad_referral(request, response):
    response.context['msg'] = 'You have already signed up. If you think this is a mistake, please try signing up again, or contact us at <a href="mailto:info@thenewhive.com">info@thenewhive.com</a>'
    response.context['error'] = 'Log in if you already have an account'
    return serve_page(response, 'pages/error.html')

def profile_thumb_set(request, response):
    request.max_content_length = 10000000 # 10 megs
    user = request.requester

    file = request.files.get('profile_thumb')
    path = os.tmpnam()
    file.save(path)
    mime = mimetypes.guess_type(file.filename)[0]
    # TODO: remove tmp file deletion from File.create, create two
    # File records, one for original sized image, one for resampled
    #res = File.create(owner=user.id, path=path, size=size, name='thumb', mime='image/jpeg')

    if mime in ['image/jpeg', 'image/png', 'image/gif']:
        profile_thumb_url = generate_thumb(user, path, (600,465))
        user.update(profile_thumb=profile_thumb_url)
    else: 
        response.context['error'] = "File must be either JPEG, PNG or GIF and be less than 10 MB"

    return redirect(response, request.form['forward'])


def expr_tag_update(request, response):
    tag = lget(normalize(request.form.get('value', '')), 0)
    id = request.form.get('expr_id')
    expr = Expr.fetch(id)
    if request.requester.id != expr.owner.id and not tag == "starred": return False
    action = request.form.get('action')
    if action == 'tag_add':
        if tag == "starred":
            s = Star.new(request.requester, expr)
            return True
        else:
            new_tags = expr.get('tags', '') + ' ' + tag
    elif action == 'tag_remove':
        if tag == "starred":
            s = Star.find(initiator=request.requester.id, entity=id)
            res = s.delete()
            if not res['err']: return True
            else: return res
        else:
            new_tags = re.sub(tag, '', expr['tags'])
    expr.update(tags=new_tags, updated=False)
    return tag

def user_tag_update(request, response):
    tag = lget(normalize(request.form.get('value', '')), 0)
    if not tag: return False
    if request.form.get('action') == 'user_tag_add': request.requester.update_cmd({'$addToSet':{'tags':tag}})
    else: request.requester.update_cmd({'$pull':{'tags':tag}})
    return True

def star(request, response):
    if not request.requester and request.requester.logged_in: raise exceptions.BadRequest()
    parts = request.path.split('/', 1)
    p1 = lget(parts, 0)
    if p1 in ["expressions", "starred", "listening"]:
        entity = User.find(sites=request.domain.lower())
    else:
        entity = Expr.named(request.domain.lower(), request.path.lower())
    if request.form.get('action') == "star":
        s = Star.new(request.requester, entity)
        if s or s.get('entity'):
          return 'starred'
        else:
          return False
    else:
       s = Star.find(initiator=request.requester.id, entity=entity.id)
       if s:
           res = s.delete()
           if not res['err']: return 'unstarred'
       else:
           return 'unstarred'

def admin_update(request, response):
    if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
    for k in ['tags', 'tagged']:
        v = json.loads(request.form.get(k))
        if v: get_root().update(**{ k : v })

def bulk_invite(request, resposne):
    if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
    form = request.form.copy()
    for key in form:
        parts = key.split('_')
        if parts[0] == 'check':
            id = parts[1]
            contact = Contact.fetch(id)
            name = form.get('name_' + id)
            if contact.get('email'):
                referral_id = mail_invite(contact['email'], name)
                if referral_id:
                    contact.update(referral_id=referral_id)
                else:
                    print "email not sent to " + contact['email'] + " referral already exists"

def add_referral(request, response):
    if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
    form = request.form.copy()
    action = form.pop('action')
    number = int(form.pop('number'))
    forward = form.pop('forward')
    if form.get('all'):
        users = User.search();
    else:
        users = []
        for key in form:
            users.append(User.fetch(key))

    for user in users: user.give_invites(number)

    return redirect(response, forward)

def add_comment(request, response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'x-requested-with')
    commenter = request.requester
    expression = Expr.fetch(request.form.get('expression'))
    comment_text = request.form.get('comment')
    comment = Comment.new(commenter, expression, {'text': comment_text})
    if comment.initiator.id != expression.owner.id:
      mail_feed(comment, expression.owner)
    return serve_html(response, jinja_env.get_template("partials/comment.html").render({'comment': comment}))


######################################
########### mail functions ###########
######################################

from cStringIO import StringIO
from smtplib import SMTP
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.header import Header
from email.generator import Generator
from email import Charset

Charset.add_charset('utf-8', Charset.QP, Charset.QP, 'utf-8')
def send_mail(headers, body):
    msg = MIMEMultipart('alternative')
    msg['Subject'] = Header(headers['Subject'].encode('utf-8'), 'UTF-8').encode()
    msg['To'] = headers['To']
    msg['From'] = headers['From']

    if type(body) == dict:
        plain = MIMEText(body['plain'].encode('utf-8'), 'plain')
        html = MIMEText(body['html'].encode('utf-8'), 'html')
        msg.attach(plain); msg.attach(html)
    else:
        part1 = MIMEText(body, 'plain')
        msg.attach(part1)

    smtp = SMTP(config.email_server)
    if config.email_user and config.email_password:
        smtp.login(config.email_user, config.email_password)

    # Unicode support is super wonky.  see http://radix.twistedmatrix.com/2010/07/how-to-send-good-unicode-email-with.html
    io = StringIO()
    g = Generator(io, False) # second argument means "should I mangle From?"
    g.flatten(msg)
    encoded_msg = io.getvalue()

    return smtp.sendmail(msg['From'], msg['To'].split(','), encoded_msg)

def mail_us(request, response):
    if not request.form.get('email'): return False
    form = {
        'name': request.form.get('name')
        ,'email': request.form.get('email')
        ,'referral': request.form.get('referral')
        ,'message': request.form.get('message')
        ,'url': request.form.get('forward')
        }
    heads = {
         'To' : 'info@thenewhive.com'
        ,'From' : 'www-data@' + config.server_name
        ,'Subject' : '[home page contact form]'
        ,'Reply-to' : form['email']
        }
    body = "Email: %(email)s\n\nName: %(name)s\n\nHow did you hear about us?\n%(referral)s\n\nHow do you express yourself?\n%(message)s" % form
    form.update({'msg': body})
    if not config.debug_mode:
        send_mail(heads, body)
    Contact.create(**form)

    mail_signup_thank_you(form)

    return serve_page(response, 'dialogs/signup_thank_you.html')

def mail_them(request, response):
    if not request.form.get('message') or not request.form.get('to'): return False

    log_data = {'service': 'email', 'to': request.form.get('to')}

    response.context.update({
         'message': request.form.get('message')
        ,'url': request.form.get('forward')
        ,'title': request.form.get('forward')
        ,'sender_fullname': request.requester.get('fullname')
        ,'sender_url': home_url(request.requester)
        })

    exp = Expr.fetch(request.form.get('id'))

    if exp:
        exp.increment({'analytics.email.count': 1})
        owner = User.fetch(exp.get('owner'))
        log_data['expr_id'] = exp.id
        response.context.update({
          'short_url': (exp.get('domain') + '/' + exp.get('name'))
          ,'tags': exp.get('tags')
          ,'thumbnail_url': exp.get('thumb', abs_url() + '/lib/skin/1/thumb_0.png')
          ,'user_url': home_url(owner)
          ,'user_name': owner.get('name')
          ,'title': exp.get('title')
          })
    else:
        log_data['url'] = request.form.get('forward')

    heads = {
         'To' : request.form.get('to')
        ,'From' : 'The New Hive <noreply+share@thenewhive.com>'
        ,'Subject' : request.form.get('subject', '')
        ,'Reply-to' : request.requester.get('email', '')
        }
    body = {
         'plain': render_template(response, "emails/share.txt")
        ,'html': render_template(response, "emails/share.html")
        }
    send_mail(heads, body)
    ActionLog.new(request.requester, 'share', data=log_data)
    if request.form.get('send_copy'):
        heads.update(To = request.requester.get('email', ''))
        send_mail(heads, body)
    return redirect(response, request.form.get('forward'))

def mail_referral(request, response):
    user = request.requester
    for i in range(0,4):
        name = request.form.get('name_' + str(i))
        to_email = request.form.get('to_' + str(i))
        if user['referrals'] <= 0 or not name or not to_email or len(name) == 0 or len(to_email) == 0: break
        referral = user.new_referral({'name': name, 'to': to_email})

        heads = {
             'To' : to_email
            ,'From' : 'The New Hive <noreply+signup@thenewhive.com>'
            ,'Subject' : user.get('fullname') + ' has invited you to The New Hive'
            ,'Reply-to' : user.get('email', '')
            }
        context = {
             'referrer_url': home_url(user)
            ,'referrer_name': user.get('fullname')
            ,'url': (abs_url(secure=True) + 'signup?key=' + referral['key'] + '&email=' + to_email)
            ,'name': name
            }
        body = {
             'plain': jinja_env.get_template("emails/user_invitation.txt").render(context)
            ,'html': jinja_env.get_template("emails/user_invitation.html").render(context)
            }
        send_mail(heads, body)
    return redirect(response, request.form.get('forward'))

def mail_invite(email, name=False, force_resend=False):
    user = get_root()

    if Referral.find(to=email) and not force_resend:
        return False

    referral = user.new_referral({'name': name, 'to': email})

    heads = {
        'To': email
        ,'From' : 'The New Hive <noreply+signup@thenewhive.com>'
        ,'Subject' : "You have a beta invitation to thenewhive.com"
        }

    context = {
        'name': name
        ,'url': (abs_url(secure=True) + 'signup?key=' + referral['key'] + '&email=' + email)
        }
    body = {
         'plain': jinja_env.get_template("emails/invitation.txt").render(context)
        ,'html': jinja_env.get_template("emails/invitation.html").render(context)
        }
    send_mail(heads, body)
    return referral.id

def mail_feed(feed, recipient, dry_run=False):
  initiator_name = feed.get('initiator_name')
  recipient_name = recipient.get('name')
  expression_title = feed.entity.get('title')
  context = {
      'user_name' : recipient_name
      , 'user_url' : recipient.url
      , 'initiator_name': initiator_name
      , 'initiator_url': feed.initiator.url
      , 'url': feed.entity.url
      , 'thumbnail_url': feed.entity.thumb
      , 'title': expression_title
      , 'type': feed['class_name']
      , 'entity_type': feed['entity_class']
      }
  heads = {
      'To': recipient.get('email')
      , 'From' : 'The New Hive <noreply@thenewhive.com>'
      }
  if type(feed) == Comment:
      context['message'] = feed.get('text')
      heads['Subject'] = initiator_name + ' commented on "' + expression_title + '"'
      context['url'] = context['url'] + "?loadDialog=comments"
  elif type(feed) == Star:
      if feed['entity_class'] == "Expr":
          heads['Subject'] = initiator_name + ' starred "' + expression_title + '"'
      elif feed['entity_class'] == "User":
          context['title'] = feed.initiator.get('fullname')
          context['url'] = feed.initiator.url
          context['thumbnail_url'] = feed.initiator.thumb
          heads['Subject'] = initiator_name + " is now listening to you"
  body = {
      'plain': jinja_env.get_template("emails/feed.txt").render(context)
      , 'html': jinja_env.get_template("emails/feed.html").render(context)
      }
  if dry_run:
      return heads
  elif recipient_name in config.admins or ( not config.debug_mode ):
      send_mail(heads, body)
      return heads



def mail_signup_thank_you(form):
    context = {
        'url': 'http://thenewhive.com'
        ,'thumbnail_url': 'http://thenewhive.com/lib/skin/1/thumb_0.png'
        ,'name': form.get('name')
        }
    heads = {
        'To': form.get('email')
        ,'From': 'The New Hive <noreply@thenewhive.com>'
        ,'Subject': 'Thank you for signing up for a beta account on The New Hive'
        }
    body = {
         'plain': jinja_env.get_template("emails/thank_you_signup.txt").render(context)
        ,'html': jinja_env.get_template("emails/thank_you_signup.html").render(context)
        }
    send_mail(heads,body)


def mail_feedback(request, response):
    if not request.form.get('message'): return serve_error(response, 'Sorry, there was a problem sending your message.')
    heads = {
         'To' : 'bugs@thenewhive.com'
        ,'From' : 'Feedback <noreply+feedback@' + config.server_name +'>'
        ,'Subject' : 'Feedback from ' + request.requester.get('name', '') + ', ' + request.requester.get('fullname', '')
        ,'Reply-to' : request.requester.get('email', '')
        }
    url = url_unquote(request.args.get('url', ''))
    body = (
        request.form.get('message')
        + "\n\n----------------------------------------\n\n"
        + url + "\n"
        + 'User-Agent: ' + request.headers.get('User-Agent', '') + "\n"
        + 'From: ' + request.requester.get('email', '')
        )
    send_mail(heads, body)
    if request.form.get('send_copy'):
        heads.update(To = request.requester.get('email', ''))
        send_mail(heads, body)
    response.context['success'] = True

def mail_user_register_thankyou(user):
    user_profile_url = home_url(user)
    user_home_url = re.sub(r'/[^/]*$', '', user_profile_url)
    heads = {
        'To' : user['email']
        , 'From' : 'The New Hive <noreply@thenewhive.com'
        , 'Subject' : 'Thank you for creating an account on thenewhive.com'
        }
    context = {
        'user_fullname' : user['fullname']
        , 'user_home_url' : user_home_url
        , 'user_home_url_display' : re.sub(r'^https?://', '', user_home_url)
        , 'user_profile_url' : user_profile_url
        , 'user_profile_url_display' : re.sub(r'^https?://', '', user_profile_url)
        }
    body = {
         'plain': jinja_env.get_template("emails/thank_you_register.txt").render(context)
        ,'html': jinja_env.get_template("emails/thank_you_register.html").render(context)
        }
    send_mail(heads, body)



########### End of mail functions ###########


def home_url(user, path='expressions'):
    """ Returns default URL for given state.User """
    return abs_url(domain = user.get('sites', [config.server_name])[0]) + path
def login(request, response):
    if auth.handle_login(request, response):
        return redirect(response, request.form.get('url', home_url(request.requester)))

def log(request, response):
    action = request.form.get('log_action')
    user = request.requester
    if action == "notifications_open":
        user.notification_count = 0

    data = json.loads(request.form.get('data', 'false'))
    if not data:
        data = {}
    l = ActionLog.new(user, request.form.get('log_action'), data)
    return True

# Possible values for the POST variable 'action'
actions = dict(
     login           = login
    ,logout          = auth.handle_logout
    ,expr_save       = expr_save
    ,expr_delete     = expr_delete
    ,files_create    = files_create
    ,file_delete     = file_delete
    ,user_create     = user_create
    ,mail_us         = mail_us
    ,mail_them       = mail_them
    ,mail_referral   = mail_referral
    ,mail_feedback   = mail_feedback
    ,user_tag_add    = user_tag_update
    ,user_tag_remove = user_tag_update
    ,tag_remove      = expr_tag_update
    ,tag_add         = expr_tag_update
    ,admin_update    = admin_update
    ,add_referral    = add_referral
    ,add_comment     = add_comment
    ,bulk_invite     = bulk_invite
    ,profile_thumb_set  = profile_thumb_set
    ,star            = star
    ,unstar          = star
    ,log             = log
    )

# Mime types that could generate HTTP POST requests
#unsafe_mimes = {
#      'text/xml'                       : True
#    , 'application/xml'                : True
#    , 'application/xhtml'              : True
#    , 'application/x-shockwave-flash'  : True
#    , 'text/x-sgml'                    : True
#    , 'text/html'                      : True
#    , 'text/xhtml'                     : True
##    , 'application/x-javascript'       : True
#    }

def length_bucket(t):
    l = len(t)
    if l < 10: return 1
    if l < 20: return 2
    return 3

def format_card(e):
    dict.update(e
        ,updated = friendly_date(time_u(e['updated']))
        ,url = abs_url(domain=e['domain']) + e['name']
        ,tags = e.get('tags_index', [])
        )
    return e

def expr_list(spec, **args):
    return map(format_card, Expr.list(spec, **args))

def expr_home_list(p2, request, response, limit=90, klass=Expr):
    root = get_root()
    tag = p2 if p2 else lget(root.get('tags'), 0) # make first tag/category default community page
    tag = {'name': tag, 'url': '/home/' + tag}
    page = int(request.args.get('page', 0))
    ids = root.get('tagged', {}).get(tag['name'], []) if klass == Expr else []
    if ids:
        by_id = {}
        for e in klass.list({'_id' : {'$in':ids}}, requester=request.requester.id): by_id[e['_id']] = e
        entities = [by_id[i] for i in ids if by_id.has_key(i)]
        response.context['pages'] = 0;
    else:
        entities = klass.list({}, sort='updated', limit=limit, page=page)
        response.context['pages'] = klass.list_count({});
    if klass==Expr:
        response.context['exprs'] = map(format_card, entities)
        response.context['tag'] = tag
        response.context['show_name'] = True
    elif klass==User: response.context['users'] = entities
    response.context['page'] = page

def handle(request): # HANDLER
    """The HTTP handler, main entry point from Werkzeug.
       All POST requests must be sent to thenewhive.com, as opposed to
       user.thenewhive.com which can contain arbitrary scripts. Any
       response for thenewhive.com must not contain unsanitized user content.
       Accepts werkzeug.Request, returns werkzeug.Response"""


    response = Response()
    request.requester = auth.authenticate_request(request, response)
    response.context = { 'f' : request.form, 'q' : request.args, 'url' : request.url }
    response.user = request.requester
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'x-requested-with')

    request.path = request.path[1:] # drop leading '/'
    request.domain = request.host.split(':')[0].lower()
    content_domain = "usercontent." + config.server_name
    if request.domain != content_domain and request.method == "POST":
        reqaction = request.form.get('action')
        if reqaction:
            insecure_actions = ['add_comment', 'star', 'unstar', 'log', 'mail_us', 'tag_add', 'mail_referral']
            non_logged_in_actions = ['login', 'log', 'user_create', 'mail_us']
            if not request.is_secure and not reqaction in insecure_actions:
                raise exceptions.BadRequest('post request action "' + reqaction + '" is not secure')
            if not request.requester.logged_in and not reqaction in non_logged_in_actions:
                raise exceptions.BadRequest('post request action "' + reqaction + '" is not logged_in')

            if urlparse(request.headers.get('Referer')).hostname == content_domain:
                raise exceptions.BadRequest('invalid cross site post request from: ' + request.headers.get('Referer'))

            if not actions.get(reqaction): raise exceptions.BadRequest('invalid action: '+reqaction)
            r = actions.get(reqaction)(request, response)
            if type(r) == Response: return r
            if r != None: return serve_json(response, r, as_text = True)
            elif reqaction != 'logout':
               print "************************would return status 204 here*************************"
               #return Response(status=204) # 204 status = no content
    if request.domain == config.server_name:
        parts = request.path.split('/', 1)
        p1 = lget(parts, 0)
        p2 = lget(parts, 1)
        if p1 == 'api':
            if p2 == 'notifications_opened':
                response = Response()
                origin = request.headers.get('origin')
                response.headers.add('Access-Control-Allow-Credentials', 'true')
                response.headers.add('Access-Control-Allow-Origin', origin)
                return serve_json(response, True)
        if p1 == 'file':
            res = File.fetch(p2)
            if not res: return serve_404(request, response)
            #if response.enforce_static and unsafe_mimes.get(resource['mime'], False):
            #    raise DangerousContent()
            response.content_type = res['mime']
            response.headers.add('Content-Disposition', 'inline', filename=res['name'])
            with open(res['fs_path']) as f: response.data = f.read()
            return response
        elif p1 == 'edit' and request.requester.logged_in:
            if not p2:
                exp = { 'domain' : lget(request.requester.get('sites'), 0) }
                exp.update(dfilter(request.args, ['domain', 'name', 'tags']))
                exp['title'] = 'Untitled'
                exp['auth'] = 'public'
                ActionLog.new(request.requester, "new_expression_edit")
            else:
                exp = Expr.fetch(p2)
                ActionLog.new(request.requester, "existing_expression_edit", data={'expr_id': exp.id})

            if not exp: return serve_404(request, response)

            if request.requester.get('flags'):
                show_help = request.requester['flags'].get('default-instructional') < 1
            else: show_help = True
            if show_help:
                request.requester.increment({'flags.default-instructional': 1})
            response.context.update({
                 'title'     : 'Editing: ' + exp['title']
                ,'sites'     : request.requester.get('sites')
                ,'exp_js'    : re.sub('</script>', '<\\/script>', json.dumps(exp))
                ,'exp'       : exp
                ,'show_help' : show_help
            })
            return serve_page(response, 'pages/edit.html')
        elif p1 == 'tag':
            response.context['exprs'] = expr_list({'tags_index':p2.lower()}, page=int(request.args.get('page', 0)), limit=90)
            response.context['tag'] = p2
            return serve_page(response, 'pages/tag_search.html')
        elif p1 == 'signup':
            referral = Referral.fetch(request.args.get('key'), keyname='key')
            if not referral or referral.get('used'): return bad_referral(request, response)
            return serve_page(response, 'pages/user_settings.html')
        elif p1 == 'referral' and request.requester.logged_in:
            if(request.requester['referrals'] <= 0):
                return no_more_referrals(request.requester['name'], request, response)
            res = Referral.create(user = request.requester.id)
            response.context['content'] = abs_url(secure=True) + 'signup?key=' + res['key']
            return serve_page(response, 'pages/minimal.html')
        elif p1 == 'feedback': return serve_page(response, 'pages/feedback.html')
        elif p1 in ['', 'home', 'people']:
            tags = get_root().get('tags', [])
            response.context['tags'] = map(lambda t: {'url': "/home/" + t, 'name': t}, tags)
            people_tag = {'url': '/people', 'name': 'People'}
            response.context['tags'].append(people_tag)
            if p1 == 'people':
                response.context['tag'] = people_tag
                klass = User
            else:
                klass = Expr
            expr_home_list(p2, request, response, klass=klass)
            if request.args.get('partial'): return serve_page(response, 'cards.html')
            else: return serve_page(response, 'pages/home.html')
        elif p1 == 'admin_home' and request.requester.logged_in:
            root = get_root()
            if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
            response.context['tags_js'] = json.dumps(root.get('tags'))
            response.context['tagged_js'] = json.dumps(root.get('tagged'), indent=2)

            expr_home_list(p2, request, response, limit=900)
            return serve_page(response, 'pages/admin_home.html')
        elif p1 == 'admin' and request.requester.get('name') in config.admins:
            return route_admin(request, response)
        elif p1 == 'analytics' and request.requester.get('name') in config.admins:
            return route_analytics(request, response)
        elif p1 == 'contacts' and request.requester.get('name') in config.admins:
            response.headers.add('Content-Disposition', 'inline', filename='contacts.csv')
            response.data = "\n".join([','.join(map(json.dumps, [time_u(o['created']).strftime('%Y-%m-%d %H:%M'), o.get('email',''), o.get('msg','')])) for o in Contact.search()])
            response.content_type = 'text/csv; charset=utf-8'
            return response
        elif p1 == 'comments':
            expr = Expr.named(request.args.get('domain'), request.args.get('path')[1:])
            response.context['exp'] = response.context['expr'] = expr
            response.context['max_height'] = request.args.get('max_height')
            if request.requester.logged_in:
                ActionLog.new(request.requester, "view_comments", data={'expr_id': expr.id})
            return serve_page(response, 'dialogs/comments.html')
        elif p1 == 'user_check': return serve_json(response, user_check(request, response))
        elif p1 == 'random':
            expr = Expr.random()
            if request.requester.logged_in:
                ActionLog.new(request.requester, "view_random_expression", data={'expr_id': expr.id})
            return redirect(response, expr.url)
         #else:
        #    # search for expressions with given tag
        #    exprs = Expr.list({'_id' : {'$in':ids}}, requester=request.requester.id, sort='created') if tag else Expr.list({}, sort='created')
        #    response.context['exprs'] = map(format_card, exprs)
        #    response.context['tag'] = tag
        #    response.context['tags'] = root.get('tags', [])
        #    response.context['show_name'] = True
        #    return serve_page(response, 'pages/home.html')

        return serve_404(request, response)
    elif request.domain.startswith('www.'):
        return redirect(response, re.sub('www.', '', request.url, 1))

    d = resource = Expr.named(request.domain.lower(), request.path.lower())
    if not d: d = resource =Expr.named(request.domain, '')
    if not d: return serve_404(request, response)
    owner = User.fetch(d['owner'])
    is_owner = request.requester.logged_in and owner.id == request.requester.id
    if is_owner: owner.unflag('expr_new')

    response.context.update(
         domain = request.domain
        ,owner = owner
        ,owner_url = home_url(owner)
        ,path = request.path
        ,user_is_owner = is_owner
        )

    if request.args.has_key('dialog'):
        dialog = request.args['dialog']
        response.context.update(exp=resource, expr=resource)
        return serve_page(response, 'dialogs/' + dialog + '.html')


    if lget(request.path, 0) == '*':
        return redirect(response, home_url(owner) +
            ('/' + request.path[1:] if len(request.path) > 1 else ''), permanent=True)
    if request.path.startswith('expressions') or request.path in ['starred', 'listening', 'feed']:
        page = int(request.args.get('page', 0))
        tags = owner.get('tags', [])
        feed_tag = {'url': "/feed", "name": "Feed"}
        star_tag = {'name': 'starred', 'url': "/starred", 'img': "/lib/skin/1/star_tab" + ("-down" if request.path == "starred" else "") + ".png"}
        people_tag = {'name': 'listening', 'url': "/listening", 'img': "/lib/skin/1/people_tab" + ("-down" if request.path == "listening" else "") + ".png" }
        if request.path.startswith('expressions'):
            spec = { 'owner' : owner.id }
            tag = lget(request.path.split('/'), 1, '')
            if tag: tag = {'name': tag, 'url': "/expressions/" + tag}
            if tag:
                spec['tags_index'] = tag['name']
            response.context['exprs'] = expr_list(spec, requester=request.requester.id, page=page, context_owner=owner.id)
        elif request.path == 'starred':
            spec = {'_id': {'$in': owner.starred_items}}
            tag = star_tag
            response.context['exprs'] = expr_list(spec, requester=request.requester.id, page=page, context_owner=owner.id)
        elif request.path == 'listening':
            tag = people_tag
            response.context['users'] = User.list({'_id': {'$in': owner.starred_items}})
        elif request.path == 'feed':
            if not request.requester.logged_in:
                return redirect(response, abs_url())
            response.context['feed_items'] = request.requester.feed
            tag = feed_tag

        response.context['title'] = owner['fullname']
        response.context['tag'] = tag
        response.context['tags'] = map(lambda t: {'url': "/expressions/" + t, 'name': t}, tags)
        if request.requester.logged_in and is_owner:
            response.context['tags'].insert(0, feed_tag)
        response.context['tags'].insert(0, people_tag)
        response.context['tags'].insert(0, star_tag)
        response.context['profile_thumb'] = owner.get('profile_thumb')
        response.context['starrers'] = map(User.fetch, owner.starrers)

        return serve_page(response, 'pages/expr_cards.html')
        #response.context['page'] = page
    else:
        response.context['starrers'] = map(User.fetch, resource.starrers)


    if not resource: return serve_404(request, response)
    if resource.get('auth') == 'private' and not is_owner: return serve_404(request, response)

    html = expr_to_html(resource)
    auth_required = (resource.get('auth') == 'password' and resource.get('password')
        and request.form.get('password') != resource.get('password')
        and request.requester.id != resource['owner'])
    response.context.update(
         edit = abs_url(secure = True) + 'edit/' + resource.id
        ,mtime = friendly_date(time_u(resource['updated']))
        ,title = resource.get('title', False)
        ,auth_required = auth_required
        ,body = html
        ,exp = resource
        ,exp_js = json.dumps(resource)
        )

    resource.increment_counter('views')
    if is_owner: resource.increment_counter('owner_views')

    template = resource.get('template', request.args.get('template', 'expression'))

    if request.requester.logged_in:
        ActionLog.new(request.requester, "view_expression", data={'expr_id': resource.id})

    if template == 'none':
        if auth_required: return Forbidden()
        return serve_html(response, html)

    else: return serve_page(response, 'pages/' + template + '.html')

def route_admin(request, response):            
    parts = request.path.split('/', 1)
    p1 = lget(parts, 0)
    p2 = lget(parts, 1)
    if p2 == 'contact_log':
        response.context['contacts'] = Contact.search()
        return serve_page(response, 'pages/admin/contact_log.html')
    if p2 == 'referrals':
        response.context['users'] = User.search()
        return serve_page(response, 'pages/admin/referrals.html')


def route_analytics(request, response):            
    import analytics
    parts = request.path.split('/', 1)
    p1 = lget(parts, 0)
    p2 = lget(parts, 1)
    if p2 == 'active_users':
        analytics.user_first_month()
        if request.args.has_key('start') and request.args.has_key('end'):
            active_users = analytics.active_users()
        else:
            event = request.args.get('event')
            if event:
                active_users = analytics.active_users(event=event)
            else:
                active_users = analytics.active_users()
            response.context['active_users'] = active_users
            response.context['active_users_js'] = json.dumps(active_users)
            return serve_page(response, 'pages/analytics/active_users.html')
    if p2 == 'invites':
        invites = Referral.search()
        cache = {}
        for item in invites:
            user_name = cache.get(item['user'])
            if not user_name:
                user_name = cache[item['user']] = User.fetch(item['user'])['name']
            item['sender_name'] = user_name

        response.context['invites'] = invites
        return serve_page(response, 'pages/analytics/invites.html')
    else:
        return serve_404(request, response)

@Request.application
def handle_safe(request):
    """Log exceptions thrown, display friendly error message.
       Not implemneted."""
    try: return handle(request)
    except Exception as e: return serve_error(request, str(e))

@Request.application
def handle_debug(request):
    """Allow exceptions to be handled by werkzeug for debugging"""
    return handle(request)

application = handle_debug
#if config.debug_mode: application = handle_debug
#else: application = handle_safe


# www_expression -> String
def expr_to_html(exp):
    """Converts JSON object representing an expression to HTML"""

    apps = exp.get('apps')
    if not apps: return ''

    def css_for_app(app):
        return "left:%fpx; top:%fpx; width:%fpx; height:%fpx; %sz-index : %d; opacity:%f;" % (
            app['position'][0],
            app['position'][1],
            app['dimensions'][0],
            app['dimensions'][1],
            'font-size : ' + str(app['scale']) + 'em; ' if app.get('scale') else '',
            app['z'],
            app.get('opacity', 1) or 1
            )

    def html_for_app(app):
        content = app.get('content', '')
        more_css = ''
        html = ''
        if app.get('type') == 'hive.image':
            html = "<img src='%s'>" % content
            link = app.get('href')
            if link: html = "<a href='%s'>%s</a>" % (link, html)
        elif app.get('type') == 'hive.rectangle':
            c = app.get('content', {})
            more_css = ';'.join([p + ':' + str(c[p]) for p in c])
        else: html = content
        data = " data-angle='" + str(app.get('angle')) + "'" if app.get('angle') else ''
        data += " data-scale='" + str(app.get('scale')) + "'" if app.get('scale') else ''
        return "<div class='happ' style='%s'%s>%s</div>" % (css_for_app(app) + more_css, data, html)

    return ''.join(map(html_for_app, apps))


jinja_env = jinja2.Environment(loader=jinja2.FileSystemLoader(joinpath(config.src_home, 'templates')))
jinja_env.trim_blocks = True

def serve_html(response, html):
    response.data = html
    response.content_type = 'text/html; charset=utf-8'
    return response
def serve_page(response, template):
    return serve_html(response, render_template(response, template))
def render_template(response, template):
    context = response.context
    context.update(
         home_url = home_url(response.user)
        ,feed_url = home_url(response.user, path='feed')
        ,user = response.user
        ,admin = response.user.get('name') in config.admins
        ,create = abs_url(secure = True) + 'edit'
        ,server = abs_url()
        ,secure_server = abs_url(secure = True)
        ,server_name = config.server_name
        ,site_pages = dict([(k, abs_url(subdomain=config.site_user) + config.site_pages[k]) for k in config.site_pages])
        ,colors = colors
        ,debug = config.debug_mode
        ,assets_env = assets_env
        ,use_ga = config.use_ga
        ,ui = ui
        )
    context.setdefault('icon', '/lib/skin/1/logo.png')
    return jinja_env.get_template(template).render(context)

def serve_json(response, val, as_text = False):
    """ as_text is used when content is received in an <iframe> by the client """

    response.mimetype = 'application/json' if not as_text else 'text/plain'
    response.data = json.dumps(val)
    return response
# maybe merge with serve_json?
#def serve_jsonp(request, response, val):
#    response.mimetype = 'application/javascript'
#    response.data = ( request.args.get('callback', 'alert')
#        + '(' + json.dumps(val) +');' )
#    return response

def serve_404(request, response):
    response.status_code = 404
    return serve_page(response, 'pages/notfound.html')

def serve_error(request, msg):
    response.status_code = 500
    response.context['msg'] = msg
    return serve_page(response, 'pages/error.html')

def redirect(response, location, permanent=False):
    response.location = location
    response.status_code = 301 if permanent else 303
    return response

class InternalServerError(exceptions.InternalServerError):
    def get_body(self, environ):
        return "Something's broken inside"

#class DangerousContent(exceptions.UnsupportedMediaType):
#    def get_body(self, environ):
#        return "If you saw this, something bad could happen"

class Forbidden(exceptions.Forbidden):
    def get_body(self, environ):
        return "You can no looky sorry"

def friendly_date(then):
    """Accepts datetime.datetime, returns string such as 'May 23' or '1 day ago'. """
    if type(then) in [int, float]:
      then = time_u(then)

    now = datetime.utcnow()
    dt = now - then
    if dt.seconds < 60:
        return "just now"
    months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    s = months[then.month] + ' ' + str(then.day)
    if then.year != now.year: s += ' ' + str(then.year)
    if dt.days < 7:
        if not dt.days:
            if dt.seconds < 3600: (t, u) = (dt.seconds / 60, 'min')
            else: (t, u) = (dt.seconds / 3600, 'hr')
        else: (t, u) = (dt.days, 'day')
        s = str(t) + ' ' + u + ('s' if t > 1 else '') + ' ago'
    return s

def large_number(number):
    if number < 10000: return str(number)
    elif 10000 <= number < 1000000:
        return str(int(number/1000)) + "K"
    elif 1000000 <= number < 10000000:
        return str(math.floor(number/100000)/10) + "M"
    elif 10000000 <= number:
        return str(int(number/1000000)) + "M"

jinja_env.filters['friendly_date'] = friendly_date
jinja_env.filters['length_bucket'] = length_bucket
jinja_env.filters['large_number'] = large_number

# run_simple is not so simple
if __name__ == '__main__':
    """ This Werkzeug server is used only for development and debugging """
    from werkzeug import run_simple
    import OpenSSL.SSL as ssl

    ctx = ssl.Context(ssl.SSLv3_METHOD)
    ctx.use_privatekey_file(config.ssl_key)
    ctx.use_certificate_file(config.ssl_cert)
    if config.ssl_ca: ctx.use_certificate_chain_file(config.ssl_ca)

    child = os.fork()
    if(child):
        run_simple(
            '0.0.0.0'
          , config.plain_port
          , application
          , use_reloader = True
          , use_debugger = config.debug_mode
          , use_evalex = config.debug_unsecure # from werkzeug.debug import DebuggedApplication
          , static_files = {
               '/lib' : joinpath(config.src_home, 'lib')
              ,'/file' : config.media_path
            }
          , processes = 0
          )
    else:
        run_simple(
            '0.0.0.0'
          , config.ssl_port
          , application
          , use_reloader = True
          , use_debugger = config.debug_mode
          , use_evalex = config.debug_unsecure # from werkzeug.debug import DebuggedApplication
          , static_files = {
               '/lib' : joinpath(config.src_home, 'lib')
              ,'/file' : config.media_path
            }
          , ssl_context  = ctx
          , processes = 0
          )
