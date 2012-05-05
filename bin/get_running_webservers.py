#! /usr/bin/python
import sys, os
parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)

try:
    from newhive.config import aws as config
except ImportError:
    from newhive import config

import boto, optparse, socket, subprocess

FORMAT = {
  'git': """[remote "{name}"]\n  url = {git_host}/var/www/newhive/\n	fetch = +refs/heads/*:refs/remotes/{name}/*"""
  , 'human': "{name:<10} {status:<8} {url}"
  }


def get_running_webservers():
    con = boto.connect_ec2(config.aws_id, config.aws_secret)
    reservations = []
    for group_name in ['application', 'dev']:
        reservations.extend(con.get_all_instances(filters={'instance-state-name': 'running', 'group-name': group_name}))
    return [i for r in reservations for i in r.instances]

def get_active_webserver_ids(load_balancer="LoadBalancer2"):
    elb = boto.connect_elb(config.aws_id, config.aws_secret)
    return [inst.instance_id for inst in elb.describe_instance_health(load_balancer)]

if __name__ == '__main__':

    parser = optparse.OptionParser()
    parser.add_option("-f", "--format", action="store", type="str", dest="format", default="human")
    parser.add_option("--secure-port", action="store", type="int", dest="secure_port")
    (options, args) = parser.parse_args()

    instances = get_running_webservers()
    live_ids = get_active_webserver_ids()
    for inst in instances:
        # doesnt work yet, need to use ec2metadata script
        #local = inst.ip_address == socket.gethostbyname(socket.gethostname())
        local = False
        dns = inst.public_dns_name
        replacements = {
                'name': inst.tags.get('Name')
                , 'url': 'localhost' if local else dns
                , 'git_host': ('' if local else dns + ':')
                , 'status': 'LIVE' if inst.id in live_ids else ''
                }
        print FORMAT[options.format].format(**replacements)
