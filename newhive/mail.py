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
