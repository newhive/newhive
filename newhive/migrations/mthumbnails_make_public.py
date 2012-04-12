import state
from wsgi import *

def update_thumb(e):
    (bucket, name) = re.findall(r'//([^.]+).s3.amazonaws.com/([\da-f]+)\?', e['thumb'])[0]
    k = state.s3_con.get_bucket(bucket).get_key(name)
    k.make_public()
    e.update(updated=False, thumb='https://' + bucket + '.s3.amazonaws.com/' + name)

def update_thumbs():
    for e in state.Expr.search(thumb = re.compile(r'\?Signature')):
        print e.get_url()
        update_thumb(e)
