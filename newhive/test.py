import copy
import unittest
from werkzeug.test import Client
from newhive import config, utils
from newhive.wsgi import application, hive_assets, Response

class Test(unittest.TestCase):
    def setUp(self):
        self.environ_base = {
                'base_url': utils.abs_url()
                , 'method': 'GET'
                }
        self.client = Client(application, Response)
        self.logged_in = False

    def open(self, secure=False, **kwargs):
        base = copy.copy(self.environ_base)
        base_url = utils.abs_url(secure=secure)
        base.update(base_url=base_url)
        base.update(kwargs)
        return self.client.open(**base)

    def log_in(self):
        if self.logged_in: return True
        data = {'action': 'login', 'username': 'test', 'secret': 'test', 'url': utils.abs_url()}
        resp = self.open(method='POST', secure=True, data=data)
        if resp.status == '303 SEE OTHER':
            self.logged_in = True
        return self.logged_in

    def assertStatus(self, response, status):
        self.assertTrue(response.status.find(str(status)) != -1)

class FileTest(Test):
    """Test various file operations"""
    def setUp(self):
        super(FileTest, self).setUp()
        self.environ_base['method'] = 'POST'
        self.data = {'action': 'file_create'}
        self.log_in()

    def upload(self, filename):
        """Shared method that uploads a file"""
        file = (open(config.src_home + '/test/assets/' + filename), filename)
        self.data.update(file=file)
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

if __name__ == '__main__':
    config.interactive = True
    unittest.main()
