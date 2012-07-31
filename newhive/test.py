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
from newhive.wsgi import application, hive_assets, Response

class Test(unittest.TestCase):
    """Base newhive test case.  Has handy methods for performing a request on
    our app, assertions on responses and helpers for test assets"""

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

    def log_in(self):
        """The werkzeug request Client saves cookies included in response, so
        you can log in using this method before performing any test cases that
        require a logged in user"""

        if self.logged_in: return True
        data = {'action': 'login', 'username': 'test', 'secret': 'test', 'url': utils.abs_url()}
        resp = self.open(method='POST', secure=True, data=data)
        if resp.status == '303 SEE OTHER':
            self.logged_in = True
        return self.logged_in

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

# this organization feature isn't really used right now
def suite():
    suite = unittest.TestSuite()
    suite.addTest(UserTest('test_profile_thumb_set'))
    return suite

# don't call tests this way anyhow, see comment at top of file
if __name__ == '__main__':
    config.interactive = True
    unittest.main()
    #unittest.TextTestRunner().run(suite())
