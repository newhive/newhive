#! /usr/bin/python
import IPython
import sys, os, optparse

parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)

def main():
    parser = optparse.OptionParser()
    parser.add_option("-f", "--credential_file", action="store", type="str", dest="credential_file")
    (options, args) = parser.parse_args()

    import newhive.manage
    import json
    if options.credential_file:
        with open(options.credential_file, 'r') as f:
            creds = json.load(f)
            newhive.manage.aws_credentials = (creds['aws_id'], creds['aws_secret'])

main()

from newhive.manage import ec2, route53

IPython.embed()
