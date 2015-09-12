#! /usr/bin/python
import sys, os
from os.path import join
from subprocess import call

parent_path = os.path.abspath(join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)
from newhive import assets
import optparse, socket

clear_cach_cmd = ['rm', '-rf', join(parent_path, 'libsrc/.webassets-cache'),
    join(parent_path, 'libsrc/.cram')]
call(clear_cach_cmd)
a = assets.HiveAssets()
a.build_header_css()
