#! /usr/bin/python

import boto

GIT_FORMAT="""[remote "%(name)s"]
  url = %(url)s:/var/www/newhive/
	fetch = +refs/heads/*:refs/remotes/%(name)s/*"""

def get_running_webservers():
    con = boto.connect_ec2() # Relies on environment variable for AWS_KEY
    reservations = []
    for group_name in ['application', 'dev']:
        reservations.extend(con.get_all_instances(filters={'instance-state-name': 'running', 'group-name': group_name}))
    return [i for r in reservations for i in r.instances]

if __name__ == '__main__':

    instances = get_running_webservers()
    for inst in instances:
        print GIT_FORMAT % {'name': inst.tags.get('Name'), 'url': inst.public_dns_name}
