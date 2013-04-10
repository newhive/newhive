from newhive import state, config
db = state.Database(config)

from werkzeug import Request, Response
from newhive import auth, config, oauth, state

from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key

import werkzeug.urls
import uuid
from md5 import md5
import subprocess
import os

def take_snapshot():
    expr_obj = db.Expr.fetch('506b8b646d902247880bd51a')
    print gen_thumb(expr_obj)
    
def gen_thumb(entity):
    """
    convert expression to an image (make a screenshot). depends on https://github.com/AdamN/python-webkit2png
    """
    # eid = request.form.get('entity')
    # entity = self.model.fetch(id)
    # if not entity: return self.serve_404(request, response)
    if entity.get('screenshot'):
        return entity.get('screenshot')#self.serve_json(response, entity.get('screenshot'))
    link = werkzeug.urls.url_fix("http://%s:%d/%s" % (config.content_domain, config.plain_port, entity['_id']))
    fileID = "/tmp/%s" % md5(str(uuid.uuid4())).hexdigest()
    filename = fileID + '-full.png'
    subprocess.Popen(["webkit2png", link, "-F", "-o", fileID]).wait()
    with open(filename) as f:
        # TODO: Find out what's up with owner=request.requester.id,
        file_res = db.File.create(dict(owner=' ',tmp_file=f, name='expr_screenshot', mime='image/png'))
        screenshotData = {'screenshot' : {'file_id': file_res['_id']}}
        entity.update(**screenshotData)
    # os.remove(filename)
    return screenshotData#self.serve_json(response, screenshotData)