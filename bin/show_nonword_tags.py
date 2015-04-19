import sys, os, re
from collections import Counter

parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)
from newhive import state, config
from newhive.utils import normalize_tags
 
words = open('/usr/share/dict/words').read().splitlines()
words = map(lambda x: x.lower().replace("'",""), words)

db = state.Database(config)
exprs = db.Expr.search({})

def get_counts_without_tag_index(data):
    tagCnt = Counter()
    for row in data:
    	tags = row.get('tags','')
        tagCnt.update(normalize_tags(tags))
    return tagCnt

tag_counts = get_counts_without_tag_index(exprs)

for k in words:
    tag_counts.pop(k, None)

print tag_counts.most_common()



