import crypt, urllib
from newhive.state import abs_url

def mail_email_confirmation(self, jinja_env, user, email):
    secret = crypt.crypt(email, "$6$" + str(int(user.get('email_confirmation_request_date'))))
    link = abs_url(secure=True) + "email_confirmation?user=" + user.id + "&email=" + urllib.quote(email) + "&secret=" + urllib.quote(secret)
    heads = {
        'To' : email
        , 'Subject' : 'Confirm change of e-mail address for thenewhive.com'
        }
    context = {
        'user_fullname' : user['fullname']
        ,'user_name': user['name']
        ,'link' : link
        }
    body = {
        'plain': jinja_env.get_template("emails/email_confirmation.txt").render(context)
        ,'html': jinja_env.get_template("emails/email_confirmation.html").render(context)
        }
    self.send_mail(heads, body)

def mail_temporary_password(self, jinja_env, user, password):
    heads = {
        'To' : user.get('email')
        , 'Subject' : 'Password recovery for thenewhive.com'
        }
    context = {
        'password': password
        ,'user_fullname' : user['fullname']
        ,'user_name': user['name']
        }
    body = {
        'plain': jinja_env.get_template("emails/password_recovery.txt").render(context)
        ,'html': jinja_env.get_template("emails/password_recovery.html").render(context)
        }
    self.send_mail(heads, body)

def mail_feed(jinja_env, feed, recipient, dry_run=False):
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
        self.send_mail(heads, body)
        return heads


