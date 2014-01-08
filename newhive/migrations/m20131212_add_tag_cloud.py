import re
from newhive import state
db = state.Database()
from newhive.utils import now, time_u, Apply

import urllib
import os

def migrate():
    return Apply.apply_all(add_tag_cloud, db.User.search({}))

def add_tag_cloud(user):
    user.calculate_tags()
    return True
