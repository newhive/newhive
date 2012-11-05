import boto
from newhive.manage import aws_credentials
from os.path import join
import os, subprocess
from newhive import config
import re

try:
    public_hostname = subprocess.check_output(['ec2metadata', '--public-hostname']).strip()
except Exception:
    public_hostname = None

def get_ec2_con():
    return boto.connect_ec2(*aws_credentials)

def get_running_webservers():
    reservations = []
    for group_name in ['application', 'dev', 'database']:
        reservations.extend(get_ec2_con().get_all_instances(filters={'instance-state-name': 'running', 'group-name': group_name}))
    return [i for r in reservations for i in r.instances]

def get_active_webserver_ids(load_balancer="LoadBalancer2"):
    elb = boto.connect_elb(*aws_credentials)
    return [inst.instance_id for inst in elb.describe_instance_health(load_balancer)]
