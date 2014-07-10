#! /usr/bin/python
import sys, os
from os.path import join
parent_path = os.path.abspath(join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)

from newhive.db_tools import *

snapshot_reset(recent_snapshot_fails(7))

if False:
    snapshot_redo_collection(username='zach')
    snapshot_redo_collection(username='cara')
