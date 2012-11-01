import boto
from newhive.manage import aws_credentials
from os.path import join
import os, subprocess
from newhive import config
from newhive.utils import memoized
import re

try:
    public_hostname = subprocess.check_output(['ec2metadata', '--public-hostname']).strip()
except Exception:
    public_hostname = None

@memoized
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

def get_latest_image(category=None):
    conn = get_ec2_con()
    images = conn.get_all_images(owners=['528729650815'])
    if category:
        images = filter(lambda im: im.tags.get('category') == category, images)
    if not len(images):
        raise ValueError("No newhive AMI with category {}".format(category))
    return sorted(images, key=lambda im: im.tags.get('created', 0), reverse=True)[0]

def launch_instance(name, category='dev', **kwargs):
    conn = get_ec2_con()
    image = get_latest_image(category)

    # Default kwargs for run_instance
    run_args = {
            'instance_type': 't1.micro'
            }
    if category in conn.get_all_security_groups():
        run_args.update({'security_groups': [cagetory]})

    # override defaults
    run_args.update(kwargs)

    reservation = conn.run_instances(image.id, **run_args)
    return reservation.instances[0]
