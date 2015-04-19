import time, threading
from newhive.utils import now, threaded_timeout
from newhive import state, config
db = state.Database(config)


from newhive.snapshot import start_snapshots
# def start_snapshotter():
    # snapshotter = SnapshotRunner(
    #     print_frequency=50,thread_limit=20,continuous=True)
    # snapshotter.run()

def start_resampler():
    image_resampler = ImageResampler(print_frequency=50, thread_limit=2,
        continuous=True)
    image_resampler.run()


class Processor(object):
    """Continuously process work"""
    def __init__(self, **args):
        super(Processor, self).__init__()
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
        old_threads = threading.active_count()
        while True:
            if len(self.queue):
                item = self.queue.pop()
                self.total = self.total + 1
                self.process(item)
                if (self.total % self.print_frequency == 0):
                    print self.total
                while threading.active_count() > self.thread_limit - old_threads:
                    print "waiting for %s threads:" % (
                        threading.active_count() - self.thread_limit - old_threads)
                    time.sleep(1)

            else:
                self.add_work()
                time.sleep(1)
                if not self.continuous and len(self.queue) == 0:
                    break

class ImageResampler(Processor):
    def __init__(self, **args):
        super(ImageScalerRunner, self).__init__(**args)
        # because we are using an extra thread per work thread to set timeout.
        self.thread_limit *= 2

    def add_work(self):
        # TODO: Need to write maintenance script to clean up files which
        # failed resamples, namely: resample_time older than 6 hours AND has no resamples
        work = list(db.File.search({'resample_time':0}).limit(10))
        _now = now()
        for k in work:
            k.update(resample_time=_now)
        self.queue.extend(work)

    def process(self, file_record):
        t = threading.Thread(target=
            threaded_timeout(file_record.set_resamples, timeout_duration=99))
        t.daemon = True
        t.start()
