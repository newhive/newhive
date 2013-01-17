from newhive.manage import ec2, slick53, aws_credentials
from newhive.utils import memoized
import boto

slick53.patch(boto)

@memoized
def get_route53_connection():
    return boto.connect_route53(*aws_credentials)

def add_cname(zone_name, name, server_dns, wildcard=False, no_confirmation=False):
    con = get_route53_connection()
    zone = con.get_zone(zone_name)
    fullname = name + '.' + zone_name
    current_value = zone.get_cname(fullname)
    if current_value:
        if current_value.resource_records[0] == server_dns:
            print "CNAME already set as requested, not doing anything."
            return
        else:
            command, message = (zone.update_cname, 'Update')
    else:
        command, message = (zone.add_cname, 'Create')
    if no_confirmation or raw_input("{} record for {:>17} CNAME {}? [YES/no]: ".format(message, fullname + '.', server_dns + '.')) == "YES":
        command(fullname, server_dns, ttl=60, comment="added via update_zonefile script")
    if wildcard:
        if no_confirmation or raw_input("{} record for *.{:>15} CNAME {}? [YES/no]: ".format(message, fullname + '.', server_dns + '.')) == "YES":
            command(u'\\052.' + fullname, server_dns, ttl=60, comment="added via update_zonefile script")

def update_zonefile(zone_name):
    con = get_route53_connection()
    zone = con.get_zone(zone_name)

    print "Fetching running servers"
    running_servers = ec2.get_running_webservers()
    print "Fetching current zonefile"
    records = zone.get_records()
    subdomains = [r.name.split('.' + zone_name)[0] for r in records if r.type == 'CNAME']

    for server in running_servers:
        name = server.tags.get('Name')
        fullname = name + '.' + zone_name
        server_dns = server.public_dns_name
        print ""
        if name in subdomains:
            current_value = zone.get_cname(name + '.' + zone_name).resource_records[0]
            print "Currently {:>25} CNAME {}".format(fullname + '.', current_value)
            command = zone.update_cname
            message = 'Update'
        else:
            command = zone.add_cname
            message = 'Create'

        if raw_input("{} record for {:>17} CNAME {}? [YES/no]: ".format(message, fullname + '.', server_dns + '.')) == "YES":
            print message
            command(name + '.' + zone_name, server_dns, ttl=60, comment="added via update_zonefile script")
        if raw_input("{} record for *.{:>15} CNAME {}? [YES/no]: ".format(message, fullname + '.', server_dns + '.')) == "YES":
            print message
            command(u'\\052.' + name + '.' + zone_name, server_dns, ttl=60, comment="added via update_zonefile script")

"""Currently live-1.tnh.me.               CNAME  ec2-184-72-74-45.compute-1.amazonaws.com.
   Update record for live-1.tnh.me     with CNAME ec2-184-72-74-45.compute-1.amazonaws.com? [YES/no]: ^CTraceback (most recent call last):"""

