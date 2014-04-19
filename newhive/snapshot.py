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
from newhive.utils import now


# TODO-for-the-love-god: move this code into the runner framework, massive cleanup.
# def start_snapshots(query_and=False):




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
        db.File.fetch(expr.get('snapshot_id')).purge()
        expr.pop('snapshot_id')
        expr.save(updated=False)

expr_limit = 10
continuous = True

def get_exprs(query_and={}):
    time_last = now() - 10*60 # Don't re-snapshot within 10 minutes
    and_exp = [
        {'snapshot_fails': {'$not': {'$gt': 5}}},
        {'$where': "!this.password && (!this.snapshot_fail_time || "
            + "this.snapshot_fail_time < " + str(time_last) + ")"},
        {"$or": [
            {"snapshot_time": { "$exists": False }},
            {"$where": "this.snapshot_time < this.updated"}
        ]}
    ]
    if test and (not query_and):
        and_exp.append({'owner_name': 'abram'})
    if query_and:
        and_exp.append(query_and)
    expressions_to_snapshot = db.Expr.search({'$and': and_exp}, sort=[('updated', -1)])
    return expressions_to_snapshot

def start_snapshots(query_and=False):
    count = 0
    while True:
    # if True:
        threads = threading.active_count()
        exprs = list(get_exprs(query_and))
        print get_exprs(query_and).count()
        if len(exprs) == 0 and not continuous: break
        # print exprs
        for expr in exprs:
            # if expr.get('_id') in existing_snapshots:
            #     print "%s already snapshotted!" % expr.get('_id')
            # else:
            #     print "not yet snapshotted %s!" % expr.get('_id')
            
            expr_id = expr.get('_id')
            count += 1
            print "(%s/%s) snapshotting %s" % (count, len(exprs), expr_id)
            expr.threaded_snapshot()
            # take_snapshot(expr_id)
            # s3_url = upload_snapshot_to_s3(expr_id, thumb_bucket)    
            while threading.active_count() > expr_limit:
                print "waiting for %s threads:" % (threading.active_count() - expr_limit)
                # log sleeps to see if server is being pounded.
                # log_error(self.db, message = "Too many snapshot threads", critical=False)
                time.sleep(1)
        wait_count = 150
        while threading.active_count() > threads and wait_count:
            print "waiting for %s threads or %ss:" % (
                threading.active_count() - threads, wait_count)
            # log sleeps to see if server is being pounded.
            # log_error(self.db, message = "Too many snapshot threads", critical=False)
            time.sleep(1)
            wait_count -= 1

    # print "need to get %s exprs" % len(expressions_to_snapshot)
    
def take_snapshot(expr_id):
    snapshots.take_snapshot(expr_id, "temp_big.png", (715, 430))
    snapshots.take_snapshot(expr_id, "temp_small.png", (390, 235))
