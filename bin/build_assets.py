#! /usr/bin/python
import sys, os
from os.path import join
from subprocess import call
parent_path = os.path.abspath(join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)

from newhive import assets
import optparse, socket

parser = optparse.OptionParser()
parser.add_option("-f", "--force", action="store_true", dest="force", default=False, help='force rebuilding of assets dispite newhive.config.debug_mode')
(options, args) = parser.parse_args()

clear_cach_cmd = ['rm', '-rf', join(parent_path, 'libsrc/.webassets-cache'),
    join(parent_path, 'libsrc/.cram')]
call(clear_cach_cmd)
a = assets.HiveAssets()
a.build(options.force)
