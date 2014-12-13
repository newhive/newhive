#! /usr/bin/python
import os, sys
parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)
from newhive.processor import start_snapshots

start_snapshots()
