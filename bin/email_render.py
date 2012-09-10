import sys, os, jinja2
parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)

import newhive
from newhive.wsgi import *
from newhive.inliner import inline_styles

context = {
    'name': "Duffy",
    'url': "http://thenewhive.com",
    'referrer_name': 'Abram',
    'referrer_url': 'http://abram.thenewhive.com',
    'admin_name': 'Cara',
    'message': "I saw this the other day and thought of you.\n  I know how much you love" +
               "microfinance, you should check this organization out.",
    'title': 'Lumana',
    'tags': "#microfinance #africa #lumana",
    'user_name': 'duffy',
    'sender_name': 'cara',
    'sender_fullname': "Cara Bucciferro",
    'sender_url': 'http://cara.thenewhive.com/profile',
    'thumbnail_url': 'https://s2-thenewhive.s3.amazonaws.com/4f9f162939219f1798000388_190x190?v=1',
    'expr': db.Expr.random(),
    'initiator': db.User.named('cara'),
    'recipient': db.User.named('duffy'),
    'header_1': 'has sent',
    'header_2': 'you an expression'
}

def write_file(data, filename, index):
    with open('lib/email/' + filename, 'w') as f: f.write(data)
    index.write("<a href='/lib/email/%s'>%s</a><br/>" % (filename, filename))

index = open('lib/email/index.html', 'w')
index.write("<html><body>")
for type in ['html', 'txt']:
    for template in ['base', 'colorful', 'invitation', 'user_invitation', 'reminder_invitation', 'share', 'new_share', 'thank_you_signup']:
        try:
            temp = jinja_env.get_template('emails/' + template + '.' + type)

            data = temp.render(context)
            write_file(data, template + '.' + type, index)

            if type == 'html':
                data = inline_styles(data, css_path='libsrc/email.css')
                write_file(data, template + '.inline.' + type, index)

        except jinja2.exceptions.TemplateNotFound:
            pass
index.close()
