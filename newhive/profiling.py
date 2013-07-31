import time
import functools
import traceback
import itertools

g_flags = {
    "mini_expressions": 3
    ,"iterations": 5
}

class Timer:    
    def __enter__(self):
        self.start = time.time()
        return self

    def __exit__(self, *args):
        self.end = time.time()
        self.interval = self.end - self.start

# do f n times, print how long it took.
# typical usage:
# don(100, functools.partial(object.func, param1, param2, ...)
def don(n, f):
    with Timer() as t:
        for i in range(n):
            f()
    print "%s: time %s ms %s avg" % (f.func, 1000.*t.interval, 1000.*t.interval/n)

def doflags(f, keys, *args):
    permutations = itertools.product(*args)
    for p in permutations:
        g_flags.update({k:v for k,v in zip(keys, p)})
        print g_flags
        don(g_flags['iterations'], f)
