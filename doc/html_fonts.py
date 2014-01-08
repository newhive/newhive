#! /usr/bin/python

import itertools
#, functional

def roundrobin(*iterables):
    "roundrobin('ABC', 'D', 'EF') --> A D E B F C"
    # Recipe credited to George Sakkis
    pending = len(iterables)
    nexts = itertools.cycle(iter(it).next for it in iterables)
    while pending:
        try:
            for next in nexts:
                yield next()
        except StopIteration:
            pending -= 1
            nexts = itertools.cycle(itertools.islice(nexts, pending))

with open('doc/fonts.txt') as f:
    content = f.readlines()
    print content

# Strip \n
content = [x.strip() for x in content]
cols = []
while True:
    next = -1
    try:
        next = content.index('--')
        col = content[:next]
    except Exception, e:
        col = content
    cols.append(col)
    if next == -1:
        break
    content = content[next + 1:]

fonts = [x for x in roundrobin(*cols)]
for j in fonts:
    print "><div class='option' style='font-family:%s'         cmd='+fontName' val='%s'        >%s       </div" % (j, j, j)
