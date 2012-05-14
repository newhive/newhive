#! /usr/bin/python
import sys, os
parent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.append(parent_path)

import optparse, socket

FORMAT = {
  'git': """[remote "{name}"]\n  url = {git_host}/var/www/newhive/\n	fetch = +refs/heads/*:refs/remotes/{name}/*"""
  , 'human': "{name:<10} {status:<8} {url}"
  , 'bash': "export TNH_{bash_var_name}={url}"
  }


from newhive.manage.ec2 import get_running_webservers, get_active_webserver_ids

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
        name = inst.tags.get('Name', '')
        replacements = {
                'name': name
                , 'bash_var_name': name.replace('-', '')
                , 'url': 'localhost' if local else dns
                , 'git_host': ('' if local else dns + ':')
                , 'status': 'LIVE' if inst.id in live_ids else ''
                }
        print FORMAT[options.format].format(**replacements)
