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

import envoy

def start_snapshots():
    expr_id = '506b8b646d902247880bd51a'
    s3_con = S3Connection(config.aws_id, config.aws_secret)
    asset_bucket = s3_con.create_bucket(config.asset_bucket)
    
    def get_exprs():
        expressions_to_snapshot = db.Expr.search({
            "$and": [
                {"auth": "public"},
                {"snapshot": {
                    "$exists": False
                }}
            ]
        },limit=100)
        return expressions_to_snapshot
        
    while True:
        exprs = get_exprs()
        if len(exprs) == 0: break
        print exprs
        for expr in exprs:
            print "snapshotting %s" % expr.get('_id')
            take_snapshot(expr.get('_id'))
            s3_url = upload_snapshot_to_s3(expr.get('_id'),asset_bucket)    
            expr['snapshot'] = s3_url
            expr.save()
    
    print "need to get %s exprs" % len(expressions_to_snapshot)
    

    
def take_snapshot(expr_id,dimensions=(500,300)):
    expr_obj = db.Expr.fetch(expr_id)
    # setup_x_server(dimensions)
    gen_thumb('http://tnh.me/' + str(expr_obj['_id']),dimensions)
    
def upload_snapshot_to_s3(expr_id,asset_bucket):
    k = S3Key(asset_bucket)
    k.name = 'expr_snapshot_' + str(expr_id)
    k.set_contents_from_filename('out-clipped.png')
    k.make_public()
    print k.name
    print k
    s3_url = "https://%s.s3.amazonaws.com/expr_snapshot_%s" % (config.asset_bucket,expr_id)
    return s3_url
    
def gen_thumb(url='http://tnh.me/5150fd4d63dade42c975b7de',dimensions=(500,300)):
    from sys import platform
    if platform == 'darwin':
        newArgs = ['webkit2png', '-C', '--clipwidth=%s' % dimensions[0], '--clipheight=%s' % dimensions[1], '--filename=out', url]
    elif platform == 'linux' or platform == 'linux2':        
        server_num = int(os.getpid() + 1e6) 
        dimensions = (1024,768)
        newArgs = ["xvfb-run", "--auto-servernum", "--server-num", str(server_num), "--server-args=-screen 0, %dx%dx24" % dimensions,
            'webkit2png', url , '--geometry=1000', '500', '--feature=javascript','-oout-clipped.png'] 
    # os.execvp(newArgs[0],newArgs[1:])
    exec_str = ' '.join(newArgs)
    print exec_str
    envoy.run(exec_str)