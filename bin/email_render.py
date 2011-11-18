from wsgi import *

context = {'name': "Duffy", 'url': "http://thenewhive.com", 'referrer_name':
'Abram', 'referrer_url': 'http://abram.thenewhive.com', 'admin_name': 'Cara',
'message': "I saw this the other day and thought of you.  I know how much you love microfinance, you should check this organization out." 
, 'title': 'Lumana', 'tags': "#microfinance #africa #lumana", 'user_name':
'duffy', 'sender_fullname': "Cara Bucciferro", 'sender_url':
'http://cara.thenewhive.com/profile', 'thumbnail_url':
'https://s2-thenewhive.s3.amazonaws.com/4e834e5eba283953b6000015?Signature=PYRlN9WNHznJoXAUDIIu%2FvYHEqg%3D&Expires=1628268128&AWSAccessKeyId=AKIAINGD337TBAXRIRJA'
}

for type in ['html', 'txt']:
  template = jinja_env.get_template('emails/invitation.' + type)
  with open('lib/email_invitation.' + type, 'w') as f:
    f.write(template.render(context))

  template = jinja_env.get_template('emails/user_invitation.' + type)
  with open('lib/email_user_invitation.' + type, 'w') as f:
    f.write(template.render(context))

  template = jinja_env.get_template('emails/reminder_invitation.' + type)
  with open('lib/email_reminder_invitation.' + type, 'w') as f:
    f.write(template.render(context))

  template = jinja_env.get_template('emails/share.' + type)
  with open('lib/email_share.' + type, 'w') as f:
    f.write(template.render(context))

  template = jinja_env.get_template('emails/thank_you_signup.' + type)
  with open('lib/email_thank_you_signup.' + type, 'w') as f:
    f.write(template.render(context))

