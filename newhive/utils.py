import time
from datetime import datetime

def now(): return time.time()

def time_s(t): return int(t.strftime('%s'))

def time_u(t): return datetime.utcfromtimestamp(t)

def junkstr(length):
    """Creates a random base 64 string"""

    def chrange(c1, c2): return [chr(i) for i in range(ord(c1), ord(c2)+1)]
    chrs = chrange('0', '9') + chrange('A', 'Z') + chrange('a', 'z') + ['.', '/']
    return ''.join([chrs[random.randrange(0, 64)] for _ in range(length)])

