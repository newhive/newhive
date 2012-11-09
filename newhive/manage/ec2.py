import os, subprocess, re, time, paramiko, getpass
import boto
from newhive import config
from newhive import manage
from newhive.manage import aws_credentials
from newhive.utils import memoized

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

def get_server_by_name(name):
    instances = filter(lambda i: i.tags.get('Name') == name, get_running_webservers())
    if instances:
        if len(instances) > 1: print "warning, multiple instances named {}".format(name)
        return instances[0]

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

def launch_instance(name, category='dev', git_branch = 'master', **kwargs):
    conn = get_ec2_con()
    image = get_latest_image(category)

    # Default kwargs for run_instance
    run_args = {
            'instance_type': 't1.micro'
            }
    if category in [g.name for g in conn.get_all_security_groups()]:
        run_args.update({'security_groups': [category]})

    # override defaults
    run_args.update(kwargs)

    print "Launching instance with ami: {} and args \n{}".format(image.id, run_args)
    reservation = conn.run_instances(image.id, **run_args)
    instance = reservation.instances[0]

    # Poll for instance startup
    print "\nWhile instance is launching, enter remote login credentials:"
    username = raw_input("username: ")
    password = getpass.getpass("password: ")
    status = instance.update()
    while status == 'pending':
        print "instance status pending"
        time.sleep(5)
        status = instance.update()
    print "instance status {}".format(status)

    print "\nsetting server name for ec2 console"
    instance.add_tag("Name", name)
    print "adding dns routes for {name}.newhive.com and {name}.newhiveexpression.com".format(name=name)
    manage.route53.add_cname('newhive.com', name, instance.public_dns_name, no_confirmation=True)
    manage.route53.add_cname('newhiveexpression.com', name, instance.public_dns_name, no_confirmation=True)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    def connect():
        try:
            ssh.connect(instance.public_dns_name, username=username, password=password)
            return True
        except Exception as e:
            return False

    print "\nWaiting 20 seconds for server to startup, then attempting to establish ssh connection"
    time.sleep(20)
    connected = connect()
    while not connected:
        print "retrying ssh connection"
        time.sleep(5)
        connected = connect()

    def remote_exec(command):
        stdin, stdout, stderr = ssh.exec_command(command)
        print "\nRemote Server:"
        for line in stdout:
            print '... ' + line.strip('\n')
        print
        ssh.close()

    command = ";".join([
            'echo',
            'echo "Checking out branch {git_branch}"',
            'cd /var/www/newhive',
            'git fetch',
            'git checkout {git_branch}',
            'git pull',
            'echo',
            'echo "setting server name"',
            'sudo /var/www/newhive/bin/set_server_name {name}',
            'echo',
            'echo "restarting apache"',
            'sudo apache2ctl graceful',
        ]).format(git_branch=git_branch, name=name)
    remote_exec(command)

    return instance
