#! /usr/bin/python
import sys, os
parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)

from newhive import assets
import optparse, socket

parser = optparse.OptionParser()
parser.add_option("-f", "--force", action="store_true", dest="force", default=False, help='force rebuilding of assets dispite newhive.config.debug_mode')
(options, args) = parser.parse_args()

a = assets.HiveAssets()
a.build(options.force)
