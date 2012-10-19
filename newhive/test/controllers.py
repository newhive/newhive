# Halleluja, we finally have some unit tests. to run all the tests, make sure
# you cd to the base of the project and then use:
#     python -m unittest newhive.test
# 
# or, to run only a subset of tests you can run something like one of the following
#     python -m unittest newhive.test.UserTest
#     python -m unittest newhive.test.FileTest.test_image

import copy
import unittest
from werkzeug.test import Client
from newhive import config, utils
from newhive.wsgi import application, hive_assets, Response, db, jinja_env
from bs4 import BeautifulSoup #html parser

class Test(unittest.TestCase):
    """Base newhive test case.  Has handy methods for performing a request on
    our app, assertions on responses and helpers for test assets"""

    def __init__(self, test_name=None):
        # instantiating standalone doesn't always work, some asserts fail
        """__init__ allows standalone instantiation in addition to use through
        unittest, depending on whether a test name is given as an argument"""
        if test_name:
            super(Test, self).__init__(test_name)
        else:
            self.setUp()

    def setUp(self):
        self.environ_base = {
                'base_url': utils.abs_url()
                , 'method': 'GET'
                }
        self.client = Client(application, Response)
        self.logged_in = False

    def open(self, secure=False, **kwargs):
        """Make a request using werkzeug.test.Client"""
        base = copy.copy(self.environ_base)
        base_url = utils.abs_url(secure=secure)
        base.update(base_url=base_url)
        base.update(kwargs)
        return self.client.open(**base)

    def log_in(self, admin=False):
        """The werkzeug request Client saves cookies included in response, so
        you can log in using this method before performing any test cases that
        require a logged in user"""

        user = {'username': 'test', 'secret': 'triangle22'}
        if self.logged_in: return True
        data = {'action': 'login', 'url': utils.abs_url()}
        data.update(user)
        resp = self.open(method='POST', secure=True, data=data)
        if resp.status == '303 SEE OTHER':
            self.user = db.User.named(user['username'])
            self.logged_in = True
        else:
            raise Exception("login failed, status {}".format(resp.status))
        if admin:
            config.admins.append(user['username'])
        return self.logged_in

    def log_out(self):
        """logs out by clobbering the werkzeug request client with a new one
        that has no cookies saved"""
        self.client = Client(application, Response)

    def assertStatus(self, response, status):
        """Check the status of a response"""
        self.assertTrue(response.status.find(str(status)) != -1)

    def get_asset(self, filename):
        """Helper takes a filename relative to /test/assets and returns a file
        tuple for use in data dictionary of werkzeug request"""
        return (open(config.src_home + '/test/assets/' + filename), filename)

class FileTest(Test):
    """Test various file operations"""
    def setUp(self):
        super(FileTest, self).setUp()
        self.environ_base['method'] = 'POST'
        self.data = {'action': 'file_create'}
        self.log_in()

    def upload(self, filename):
        """Shared method that uploads a file"""
        self.data.update(file=self.get_asset(filename))
        resp = self.open(data=self.data, secure=True)
        return resp

    def test_image(self):
        """Test uploading an image"""
        response = self.upload('logo.png')
        self.assertStatus(response, 200)

    def test_mp3(self):
        """Test uploading an mp3"""
        response = self.upload('iloveyou.mp3')
        self.assertStatus(response, 200)

class UserTest(Test):
    """Test actions of the user controller"""

    def setUp(self):
        super(UserTest, self).setUp()
        self.log_in()

    def test_profile_thumb_set(self):
        response = self.open(method='POST', data={'action': 'profile_thumb_set', 'file': self.get_asset('logo.png')})
        return response

class SignupTest(Test):
    def setUp(self):
        super(SignupTest, self).setUp()
        self.environ_base['method'] = 'POST'

    def test_request_invite(self):
        """Test the request invite form"""
        email = 'test+{}@thenewhive.com'.format(utils.junkstr(8).lower())
        data = {
                'action': 'signup_request'
                , 'name': 'test'
                , 'email': email
                , 'referral': 'referral field'
                , 'message': 'message field'
                , 'forward': utils.abs_url()
                }
        response = self.open(data=data)
        self.assertStatus(response, 200)

        # Check newly created contact record
        record = db.Contact.last()
        print record
        self.assertEqual(record['email'], email)

        return record

    def test_invite_from_contact_log(self):
        """Test the bulk invite functionality of /admin/contact_log"""
        contact = self.test_request_invite()

        self.log_in(admin=True)
        data = {
                'action': 'bulk_invite'
                , 'forward': ''
                , 'check_' + contact.id: '1'
                , 'name_' + contact.id: contact['name']
                }
        response = self.open(data=data, secure=True)
        self.assertStatus(response, 200)

        # Check newly created referral record
        referral = db.Referral.last()
        self.assertEqual(referral['to'], contact['email'])

        # Check that contact record is properly updated
        new_contact = db.Contact.fetch(contact.id)
        self.assertEqual(new_contact['referral_id'], referral.id)

        return referral

    def test_use_invite(self):
        """test that the url generated by the invite is valid"""
        referral = self.test_invite_from_contact_log()
        self.log_out()

        path = referral.url.path
        response = self.open(path=path)
        self.assertStatus(response, 200)

        # even if response is 200, invite could be used, so check that we're
        # looking at the create account or 'signup' page
        soup = BeautifulSoup(response.data)
        self.assertIn('signup', soup.body['class'])

        return response

class ExpressionTest(Test):
    def setUp(self):
        super(ExpressionTest, self).setUp()
        self.expr = db.Expr.random()
        self.environ_base.update({
            'base_url': self.expr.url
            ,'path': self.expr.url.split('/',3)[3]
            , 'method': 'POST'
            })
        self.log_in()

    def test_share_expr(self):
        data = {
                'action': 'share_expr',
                'to': self.user['email'],
                'message': 'test share expression message. this is generated by newhive/test.py'
                }
        response = self.open(data=data)
        print response.status
        self.assertStatus(response, 303)
