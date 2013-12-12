import re
import urllib
import os
from PIL import Image

from newhive import state
db = state.Database()
from newhive.utils import now, time_u, Apply
from newhive.controllers.file import fetch_url, create_file

def update_file(f):
    imo = Image.open(f.file)
    new_file = os.tmpfile()
    imo.save(new_file, format='jpeg')
    f.reset_file(new_file)
    f.update(mime='image/jpeg')

def migrate():
    for r in db.File.search({'generated_from_type':'Expr'}):
        update_file(r)
