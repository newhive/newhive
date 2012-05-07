import boto
from newhive.manage import aws_credentials

ec2_con = boto.connect_ec2(*aws_credentials)

def get_running_webservers():
    reservations = []
    for group_name in ['application', 'dev']:
        reservations.extend(ec2_con.get_all_instances(filters={'instance-state-name': 'running', 'group-name': group_name}))
    return [i for r in reservations for i in r.instances]

def get_active_webserver_ids(load_balancer="LoadBalancer2"):
    elb = boto.connect_elb(*credentials)
    return [inst.instance_id for inst in elb.describe_instance_health(load_balancer)]
