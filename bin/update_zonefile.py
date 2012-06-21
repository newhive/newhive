#! /usr/bin/python
import sys, os
parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)

from newhive.manage.route53 import update_zonefile

if __name__ == '__main__': update_zonefile('thenewhive.com')
