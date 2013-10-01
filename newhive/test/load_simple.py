# Loadtester
#
# from src base, run:
# python -m unittest newhive.test.load_test
import os, sys
sys.path.insert(0, os.getcwd())

from subprocess import call, Popen, PIPE
from newhive.utils import now
import threading
import unittest
import time, math
from urllib2 import urlopen
from newhive import state, config
from newhive.config import abs_url

db=state.Database()

max_threads = 32
max_time = 120.

# TODO: make this a serializable class
# with an option to write to a file
class Log(object):
    """docstring for Log"""
    # histogram = {} 
    def __init__(self):
        super(Log, self).__init__()
        self.histogram = {}
        self.queries = {}
        self.log = []

    def append(self, url, msg):
        bucket = msg
        if type(msg) == float:
            bucket = "%d" % 2**math.floor(math.log(msg*1000)/math.log(2))
        self.histogram[bucket] = 1 + self.histogram.get(bucket, 0)
        if not self.queries.get(bucket):
            self.queries[bucket] = []
        self.queries[bucket].append((url, msg))
        # print bucket
        # print self.histogram[bucket]
        self.log.append((url, msg))

log = Log()


# TODO: break into separate module
print_severity = 0

def debug(txt, severity=0):
    if severity >= print_severity:
        print txt
###

# TODO: flush log to disk
def append_log(url, msg):
    log.append(url, msg)
    debug("%s: %s" % (url,msg))

# TODO: figure out how to query random parts of an external server.
# This code assumes that the local db is (mostly) in sync
# with the external one.
# Alternatively, require the loadtest to run *on* the external machine
server = abs_url()[:-1]

exprs = db.Expr.search({})
def generate_url_expr(count):
    new_count = (count + 2000) % exprs.count()
    expr = exprs[new_count]
    return "%s/%s/%s" % (server, expr['owner_name'], expr['name'])
users = db.User.search({})
def generate_url_profile(count):
    new_count = (count + 2000) % users.count()
    user = users[new_count]
    return "%s/%s/profile" % (server, user['name'])
def test_url(count):
    return "%d test" % count

generate_urls = [generate_url_expr]

class LoadTest(unittest.TestCase):
    def setUp(self):
        self.error_count = 0
        self.success_count = 0

    def threaded_wget(self, url, time_out=0, pipe=None):
        if False and time_out:
            # If given a maximum execution time, call back into self,
            # and join with a timeout. If joined thread succeeds, it takes
            # care of itself, otherwise handle errors on this thread.
            pipe = {}
            t = threading.Thread(target=self.threaded_wget, args = (url,0,pipe))
            t.daemon = True
            t.start()
            t.join(time_out)
            if t.isAlive():
                append_log(url, "timeout")
                self.error_count += 1
                self.running_queries -= 1
                pipe['kill'] = True
            return

        time_start = now()
        # debug("fetching: " + url)
        error = False
        try:
            res = urlopen(url, None, time_out)
        except Exception, e:
            error = True
        
        if pipe and pipe.get('kill'):
            return

        if error:
            self.error_count += 1
            append_log(url, "error")
        elif res.getcode() >= 400:
            self.error_count += 1
            append_log(url, "timeout")
        else:
            self.success_count += 1
            append_log(url, now() - time_start)

        self.running_queries -= 1

    def wget(self, url, time_out=10, pipe=None):
        error = False
        try:
            res = urlopen(url, None, time_out)
        except Exception, e:
            print e
            error = True

        return error

    def loadtest(self, max_count=9999, qps=5., generate_url=test_url):
        global log
        log = Log()
        self.error_count = 0
        self.success_count = 0
        self.running_queries = 0
        
        count = 0
        time_out = max_time
        time_start = now()

        for count in xrange(max_count):
            calc_qps = 0 if not count else count / (now() - time_start)
            while calc_qps > qps or threading.active_count() > max_threads:
                calc_qps = 0 if not count else count / (now() - time_start)
                #
                # debug("waiting for %s threads:" % (threading.active_count() - max_threads))
                # debug("qps: %f" % calc_qps)
                time.sleep(.1)
            url = generate_url(count)
            t = threading.Thread(target=self.threaded_wget, args=(url,time_out))
            t.daemon = True
            t.start()
            self.running_queries += 1

        while threading.active_count() > 1:
            time.sleep(.1)

        count += 1
        total_time = now() - time_start
        final_qps = self.success_count / total_time
        print
        print "Loadtest complete (%f seconds)" % total_time
        print "(%d/%d) errors/total: %f QPS" % (self.error_count, count, final_qps)
        print log.histogram
        # Passing condition is that 98% of queries succeeded.
        return (self.error_count < count * .02)

    def simple(self, qps=1):
        count = 0
        while True:
            self.wget(generate_url_profile(count))
            self.wget(generate_url_expr(count))
            time.sleep(1)
            count += 1

    def test_simple(self):
        self.simple()
    # def test_load_user(self):
    #     self.assertTrue(self.loadtest(max_count=100, qps=20., generate_url=generate_url_profile))
    # def test_load_expr(self):
    #     self.assertTrue(self.loadtest(max_count=100, qps=20., generate_url=generate_url_expr))

if __name__ == '__main__':
    unittest.main()
