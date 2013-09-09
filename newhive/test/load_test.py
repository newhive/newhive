# Loadtester
#
#
from subprocess import call, Popen, PIPE
from newhive.utils import now
import threading
import unittest
import time

max_threads = 32
max_time = 10.

# TODO: make this a serializable class
# with an option to write to a file
log = []


# TODO: break into separate module
print_severity = 0

def debug(txt, severity=0):
    if severity >= print_severity:
        print txt
###

# TODO: flush log to disk
def append_log(url, msg):
    log.append((url, msg))
    debug("%s: %s" % (url,msg))

# TODO: implement
def generate_url(count):
    return "%d test" % count

class LoadTest(unittest.TestCase):
    def setUp(self):
        error_count = 0
        success_count = 0

    # returns -1 or time
    def threaded_wget(self, url, time_out=0, pipe=None):
        if time_out:
            # If given a maximum execution time, call back into self,
            # and join with a timeout. If joined thread succeeds, it takes
            # care of itself, otherwise handle errors on this thread.
            pipe = {}
            t = threading.Thread(target=self.threaded_wget, args = (url,0,pipe))
            t.daemon = True
            t.start()
            # TODO: this needs to occur on another thread so loadtest can continue
            t.join(time_out)
            if t.isAlive():
                # TODO-perf: could be wise to also kill the thread
                append_log(url, "timeout")
                self.error_count += 1
                pipe['kill'] = True
            return

        time_start = now()
        # debug("fetching: " + url)
        # TODO: do real work
        # res = wget
        res = time.sleep(.2)
        #
        if pipe and pipe.get('kill'):
            return
        self.success_count += 1
        append_log(url, str(now() - time_start))

    def test_load(self):
        self.loadtest(max_count=10, qps=2.)

    def loadtest(self, max_count=9999, qps=5.):
        self.error_count = 0
        self.success_count = 0
        
        count = 0
        time_out = max_time
        time_start = now()

        for count in xrange(max_count):
            calc_qps = 0 if not count else count / (now() - time_start)
            while calc_qps > qps or threading.active_count() > max_threads:
                calc_qps = 0 if not count else count / (now() - time_start)
                #
                debug("waiting for %s threads:" % (threading.active_count() - max_threads))
                debug("qps: %d" % calc_qps)
                # log sleeps to see if server is being pounded.
                # log_error(self.db, message = "Too many snapshot threads", critical=False)
                time.sleep(1)
            # TODO: get URLs from generator
            url = generate_url(count)
            t = threading.Thread(target=self.threaded_wget, args=(url,time_out))
            t.daemon = True
            t.start()

        return True


if __name__ == '__main__':
    unittest.main()
