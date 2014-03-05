from newhive import state, config
db = state.Database(config)

import time, threading
from newhive.utils import now, time_u

class Runner(object):
    """Continuously process work"""
    def __init__(self, **args):
        super(Runner, self).__init__()
        self.queue = []
        self.total = 0
        self.print_frequency = args.get('print_frequency', 50)
        self.thread_limit = args.get('thread_limit', 10)
        self.continuous = args.get('continuous', True)
        self.args = args

    def add_work(self):
        pass

    def process(self, item):
        pass

    def run(self):
        while True:
            if len(self.queue):
                item = self.queue.pop()
                self.total = self.total + 1
                self.process(item)
                if (self.total % self.print_frequency == 0):
                    print self.total
                while threading.active_count() > self.thread_limit:
                    print "waiting for %s threads:" % (
                        threading.active_count() - self.thread_limit)
                    time.sleep(1)

            else:
                self.add_work()
                time.sleep(1)
                if not self.continuous:
                    break

class ImageScalerRunner(Runner):
    def add_work(self):
        work = list(db.File.search({'resample_time':0}).limit(10))
        _now = now()
        for k in work:
            k.update(resample_time=_now)
        self.queue.extend(work)

    def process(self, file_record):
        t = threading.Thread(target=file_record.set_resamples)
        t.daemon = True
        t.start()
