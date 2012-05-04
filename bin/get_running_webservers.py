#! /usr/bin/python

import boto, optparse, socket, subprocess

FORMAT = {
  'git': """[remote "{name}"]\n  url = {git_host}/var/www/newhive/\n	fetch = +refs/heads/*:refs/remotes/{name}/*"""
  , 'human': "{name:<20} {url}"
  }


def get_running_webservers():
    con = boto.connect_ec2() # Relies on environment variable for AWS_KEY
    reservations = []
    for group_name in ['application', 'dev']:
        reservations.extend(con.get_all_instances(filters={'instance-state-name': 'running', 'group-name': group_name}))
    return [i for r in reservations for i in r.instances]

if __name__ == '__main__':

    parser = optparse.OptionParser()
    parser.add_option("-f", "--format", action="store", type="str", dest="format", default="human")
    parser.add_option("--secure-port", action="store", type="int", dest="secure_port")
    (options, args) = parser.parse_args()

    instances = get_running_webservers()
    for inst in instances:
        # doesnt work yet, need to use ec2metadata script
        #local = inst.ip_address == socket.gethostbyname(socket.gethostname())
        local = False
        dns = inst.public_dns_name
        replacements = {
                'name': inst.tags.get('Name')
                , 'url': 'localhost' if local else dns
                , 'git_host': ('' if local else dns + ':')
                }
        print FORMAT[options.format].format(**replacements)
