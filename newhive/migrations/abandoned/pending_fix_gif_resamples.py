import re
import urllib
import os
from time import sleep

from newhive import state
from newhive.utils import now, time_u, lget
from newhive.server_session import db


broken_files = []
lost_files = []

def migrate():
    for r in db.File.search({'mime':'image/gif', 'resamples':{'$exists':True}}):
        resample(r)

def resample(file):
    file.set_resamples()
