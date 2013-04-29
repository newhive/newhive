from newhive import state, config
from collections import Counter
 
w = open('/usr/share/dict/words').read().splitlines()
words = map(lambda x: x.lower().replace("'",""), words)

db = state.Database(config)
exprs = db.Expr.search({})

def get_counts_without_tag_index(data):
    tagCnt = Counter()
    for row in data:
    	tags = row.get('tags','')
        tagCnt.update(normalize_tags(tags))
    return tagCnt

def normalize_tags(ws):
    l1 = re.findall(r'"(.*?)"',ws,flags=re.UNICODE)
    ws_no_quotes = re.sub(r'"(.*?)"', '', ws, flags=re.UNICODE)
    if ',' in ws:
        l2 = re.split(r'[,#]', ws_no_quotes, flags=re.UNICODE)
    elif '#' in ws:
        l2 = re.split(r'[#]', ws_no_quotes, flags=re.UNICODE)
    else:
        l2 = re.split(r'[\s]', ws_no_quotes, flags=re.UNICODE)
    return list(set(filter(None,map(format_tags, l1+l2))))	

tag_counts = get_counts_without_tag_index(exprs)

for k in words:
    tag_counts.pop(k, None)

print tag_counts.most_common()



