import sys, os
parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)

import newhive
from newhive.wsgi import *

context = {'name': "Duffy", 'url': "http://thenewhive.com", 'referrer_name':
'Abram', 'referrer_url': 'http://abram.thenewhive.com', 'admin_name': 'Cara',
'message': "I saw this the other day and thought of you.  I know how much you love microfinance, you should check this organization out." 
, 'title': 'Lumana', 'tags': "#microfinance #africa #lumana", 'user_name':
'duffy', 'sender_fullname': "Cara Bucciferro", 'sender_url':
'http://cara.thenewhive.com/profile', 'thumbnail_url':
'https://s2-thenewhive.s3.amazonaws.com/4f9f162939219f1798000388_190x190?v=1'
}

index = open('lib/email/index.html', 'w')
index.write("<html><body>")
for type in ['html', 'txt']:
    for template in ['invitation', 'user_invitation', 'reminder_invitation', 'share', 'thank_you_signup']:
        filename = template + '.' + type
        temp = jinja_env.get_template('emails/' + filename)
        with open('lib/email/' + filename, 'w') as f:
            f.write(temp.render(context))
        index.write("<a href='/lib/email/%s'>%s</a><br/>" % (filename, filename))
index.close()
