import os
import io
from newhive import server_session
from newhive.controllers.expr import expr_to_page
from newhive.utils import Apply

db = server_session.db


def bake_newhive(nh, dryrun=False):
    html = expr_to_page(server_session, nh)
    if dryrun:
        print(html)
        return False

    tmp = os.tmpnam()
    with io.open(tmp, 'w', encoding='utf8') as f:
        f.write(html)
    path = nh['owner_name'] + '/' + nh['name']
    server_session.db.s3.upload_file(tmp, 'new-content', path,
        nh['name'], 'text/html')
    os.unlink(tmp)

    return True
