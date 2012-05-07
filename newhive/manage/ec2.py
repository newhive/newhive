import boto

try:
    from newhive.config import aws as config
except ImportError:
    "Could not import aws.py"
    from newhive import config

if hasattr(config, 'aws_id') and hasattr(config, 'aws_secret'):
    credentials = (config.aws_id, config.aws_secret)
else:
    credentials = ()

ec2_con = boto.connect_ec2(*credentials)

def get_running_webservers():
    reservations = []
    for group_name in ['application', 'dev']:
        reservations.extend(ec2_con.get_all_instances(filters={'instance-state-name': 'running', 'group-name': group_name}))
    return [i for r in reservations for i in r.instances]

def get_active_webserver_ids(load_balancer="LoadBalancer2"):
    elb = boto.connect_elb(*credentials)
    return [inst.instance_id for inst in elb.describe_instance_health(load_balancer)]
