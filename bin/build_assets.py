#! /usr/bin/python
import sys, os
parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)

from newhive import assets

a = assets.HiveAssets()
a.build()
