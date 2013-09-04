# requires xvfb on the running machine:
# sudo apt-get install xvfb

# troubleshooting
#
# Xvfb likes this file to be modifyable
# sudo chown www-data:dev  /tmp/.X11-unix
#


from newhive import state, config
db = state.Database(config)

from werkzeug import Request, Response
from newhive import auth, config, oauth, state
from newhive.snapshots import Snapshots

from boto.s3.connection import S3Connection
from boto.s3.key import Key as S3Key

import werkzeug.urls
import uuid
from md5 import md5
import os

from random import choice

from subprocess import Popen
# import envoy
import threading

from datetime import datetime
import time


urls = ["http://tnh.me/50f60b796d902242fd02a754",
"http://tnh.me/50f737d36d902248910accfe"]
expr_ids = ["50f60b796d902242fd02a754",
"50f737d36d902248910accfe"]
snapshots = Snapshots()

def sss():
    snapshots.take_snapshot("4eace6b3ba28392acc000083", "snap_out.png", (715, 430))
    # snapshots.take_snapshot("5034466363dade522e00727f", "snap2_out.png", (715, 430))

    # snapshots.take_snapshot("50f737d36d902248910accfe", "snap_out.png", (715, 430))

def test_snapshot():
    # s3_con = S3Connection(config.aws_id, config.aws_secret)
    # thumb_bucket = s3_con.create_bucket(config.s3_buckets['thumb'])
    # xvfb = init_xvfb()
    # for url in urls:
    #     gen_thumb(url)
    #     upload_snapshot_to_s3(url.split('/')[-1],thumb_bucket)
    for expr_id in expr_ids:
        expr = db.Expr.fetch(expr_id)
        print "snapshotting %s" % expr_id
        expr.take_snapshots()
        # take_snapshot(expr)
        # print upload_snapshot_to_s3(expr,thumb_bucket)
        
    # xvfb.terminate()
    
test = False

def clear_snapshots():
    expressions_to_snapshot = db.Expr.search({
        "$and": [
            {"snapshot_time": {
                "$exists": True
            }}
            # bugbug    
            # ,{"owner_name": "abram"}
        ]
    })
    if test:
        expressions_to_snapshot = db.Expr.search({
            "$and": [
                {"snapshot_time": {
                    "$exists": True
                }},
            {"owner_name": "abram"}
        ] })
    for expr in expressions_to_snapshot:
        expr.pop('snapshot_time')
        expr.save()

expr_limit = 5

def start_snapshots(proc_tmp_snapshots=False):
    s3_con = S3Connection(config.aws_id, config.aws_secret)
    # thumb_bucket = config.s3_buckets['thumb']
    thumb_bucket = s3_con.create_bucket(config.s3_buckets['thumb'])
 
    # xvfb = init_xvfb()
    
    # existing_snapshots = proccess_snapshots_file() if proc_tmp_snapshots else []
    
    def get_exprs(limit):
        expressions_to_snapshot = db.Expr.search({
            "$and": [
                {"snapshot_time": {
                    "$exists": False
                }}
            ]
        }, limit=limit, sort=[('updated', -1)])
        if test:
            expressions_to_snapshot = db.Expr.search({
                "$and": [
                    {"snapshot_time": {
                        "$exists": False
                    }},
                {"owner_name": "abram"}
            ] },limit=limit)
        return expressions_to_snapshot

    count = 0
    total = get_exprs(0).count()
    # sss()
    threads = threading.active_count()
    while True:
    # if True:
        exprs = get_exprs(expr_limit)
        print total
        if len(exprs) == 0: break
        # print exprs
        for expr in exprs:
            # if expr.get('_id') in existing_snapshots:
            #     print "%s already snapshotted!" % expr.get('_id')
            # else:
            #     print "not yet snapshotted %s!" % expr.get('_id')
            
            expr_id = expr.get('_id')
            count += 1
            print "(%s/%s) snapshotting %s" % (count, total, expr_id)
            expr.threaded_snapshot()
            # take_snapshot(expr_id)
            # s3_url = upload_snapshot_to_s3(expr_id, thumb_bucket)    
        while threading.active_count() > threads:
            print "waiting for %s threads:" % (threading.active_count() - threads)
            # log sleeps to see if server is being pounded.
            # log_error(self.db, message = "Too many snapshot threads", critical=False)
            time.sleep(1)

    # print "need to get %s exprs" % len(expressions_to_snapshot)
    
def take_snapshot(expr_id):
    snapshots.take_snapshot(expr_id, "temp_big.png", (715, 430))
    snapshots.take_snapshot(expr_id, "temp_small.png", (390, 235))
    # expr_obj = db.Expr.fetch(expr_id)
    # setup_x_server(dimensions)
    # gen_thumb('http://tnh.me/' + str(expr_obj['_id']),dimensions)
# def upload_snapshot_to_s3(expr_id,thumb_bucket):
#     # def upload_image(local,remote):
#     #     k = S3Key(thumb_bucket)
#     #     k.name = remote
#     #     k.set_contents_from_filename(local)
#     #     k.make_public()
#     #     print "uploaded ",remote
#     expr_obj = db.Expr.fetch(expr_id)
#     expr.take_snapshots()
#     return expr.snapshot("big")
#     s3_url = Snapshots.s3_url(expr_id)

#     # remote = Snapshots.remote_uri(expr_id)
#     # upload_image('temp_small.png',remote + '_small')
#     # upload_image('temp_big.png',remote + '_big')
#     # expr_obj['snapshot'] = {
#     #     "timestamp": time.time()
#     #     # ,"url": s3_url
#     # }
#     # # Save the expression, but don't update its "updated" time.
#     # expr_obj.save(updated=False)
#     return s3_url
    
# def gen_thumb(url,dimensions=(500,300)):
#     from sys import platform
#     if platform == 'darwin':
#         newArgs = ['webkit2png', '-C', '--clipwidth=%s' % dimensions[0], '--clipheight=%s' % dimensions[1], '--filename=out', url]
#         exec_str = ' '.join(newArgs)
#         print exec_str
#         envoy.run(exec_str)
#     elif platform == 'linux' or platform == 'linux2':        
#         # server_num = int(os.getpid() + 1e6)
#         dimensions = (1024,768)
#         cmd = ' '.join(['webkit2png', '--feature=javascript', '--display=:99', '--geometry=715 430',
#             '--output=temp_big.png', url])
#         print cmd
#         envoy.run(cmd)
#         envoy.run(' '.join(['webkit2png', '--feature=javascript', '--display=:99', '--geometry=390 235',
#             '--output=temp_small.png', url]))
        
#         # newArgs = ["xvfb-run", "--auto-servernum", "--server-num", str(server_num), "--server-args=-screen 0, %dx%dx24" % dimensions,
#         #     'webkit2png', url , '--geometry=1000', '500', '--feature=javascript','-oout-clipped.png'] 
#     # os.execvp(newArgs[0],newArgs[1:])
# def xvfb_running():
#     sp = Popen(['xdpyinfo','-display',':99'])
#     return sp.returncode == 0

# def init_xvfb():
#     xvfb = Popen(["Xvfb", ":99", "-screen", "scrn" ,"1024x768x24"])
#     return xvfb
#  
# def process_snapshots_file():
#     lines = open('/tmp/snapshots','r').read().split("\n")
#     import re
#     def get_id(line_str):
#         ret = re.search('s3://dev-1-s0-newhive/expr_snapshot_([0-9a-f]+)_big',line_str)
#         if ret is None:
#             return None
#         if ret:
#             return ret.group(1)
#     ids = [get_id(line) for line in lines if get_id(line)]
#     return ids
'''

'''
