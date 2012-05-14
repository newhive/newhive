# boto.route53 patch from https://github.com/rubic/boto/blob/ae4fd9cf6a4b6a5fd46e0303b16f59a4d9ae6ae4/boto/route53/connection.py

from boto.route53.record import ResourceRecordSets

def get_zone(self, name):
    """ Retrieve the hosted zone supplied by name."""
    for zone in self.get_zones():
        if name == zone.name[:-1]:
            return zone

def get_zones(self):
    """ Retrieve a list of all hosted zones."""
    zones = self.get_all_hosted_zones()
    return [Zone(self, zone) for zone in zones['ListHostedZonesResponse']['HostedZones']]

def _make_qualified(self, value):
    """ Turn unqualified domain names into qualified ones."""
    if type(value) in [list, tuple, set]:
        new_list = []
        for record in value:
            if record and not record[-1] == '.':
                new_list.append("%s." % record)
            else:
                new_list.append(record)
        return new_list
    else:
        value = value.strip()
        if value and not value[-1] == '.':
            value = "%s." % value
        return value

default_ttl = 60

def repr_record_set(self):
    record_list = ','.join([record.__repr__() for record in self])
    return '[%s]' % record_list

ResourceRecordSets.__repr__ = repr_record_set

class Zone(object):
    def __init__(self, route53connection, zone_dict):
        self.route53connection = route53connection
        for key in zone_dict:
            if key == 'Id':
                self.id = zone_dict['Id'].replace('/hostedzone/','')
            else:
                self.__setattr__(key.lower(), zone_dict[key])

    def __repr__(self):
        return '<Zone:%s>' % self.name

    def add_record(self, resource_type, name, value, ttl=60, comment=""):
        """Add a new record to a zone"""
        changes = ResourceRecordSets(self.route53connection, self.id, comment)
        change = changes.add_change("CREATE", name, resource_type, ttl)
        if type(value) in [list, tuple, set]:
            for record in value:
                change.add_value(record)
        else:
            change.add_value(value)
        Status(self.route53connection,
               changes.commit()['ChangeResourceRecordSetsResponse']['ChangeInfo'])

    def update_record(self, resource_type, name, old_value, new_value, old_ttl, new_ttl=None, comment=""):
        new_ttl = new_ttl or default_ttl
        changes = ResourceRecordSets(self.route53connection, self.id, comment)
        change = changes.add_change("DELETE", name, resource_type, old_ttl)
        if type(old_value) in [list, tuple, set]:
            for record in old_value:
                change.add_value(record)
        else:
            change.add_value(old_value)
        change = changes.add_change('CREATE', name, resource_type, new_ttl)
        if type(new_value) in [list, tuple, set]:
            for record in new_value:
                change.add_value(record)
        else:
            change.add_value(new_value)
        Status(self.route53connection,
               changes.commit()['ChangeResourceRecordSetsResponse']['ChangeInfo'])

    def delete_record(self, resource_type, name, value, ttl=None, comment=""):
        """Delete a record from a zone"""
        ttl = ttl or default_ttl
        changes = ResourceRecordSets(self.route53connection, self.id, comment)
        change = changes.add_change("DELETE", name, resource_type, ttl)
        if type(value) in [list, tuple, set]:
            for record in value:
                change.add_value(record)
        else:
            change.add_value(value)
        Status(self.route53connection,
               changes.commit()['ChangeResourceRecordSetsResponse']['ChangeInfo'])

    def add_cname(self, name, value, ttl=None, comment=""):
        ttl = ttl or default_ttl
        name = self.route53connection._make_qualified(name)
        value = self.route53connection._make_qualified(value)
        return self.add_record(resource_type='CNAME',
                               name=name,
                               value=value,
                               ttl=ttl,
                               comment=comment)

    def add_a(self, name, value, ttl=None, comment=""):
        """Add an A record to the zone."""
        ttl = ttl or default_ttl
        name = self.route53connection._make_qualified(name)
        return self.add_record(resource_type='A',
                               name=name,
                               value=value,
                               ttl=ttl,
                               comment=comment)

    def add_mx(self, records, ttl=None, comment=""):
        """Add an MX record to the zone."""
        ttl = ttl or default_ttl
        records = self.route53connection._make_qualified(records)
        return self.add_record(resource_type='MX',
                               name=self.name,
                               value=records,
                               ttl=ttl,
                               comment=comment)

    def get_cname(self, name):
        """ Get the given CNAME record."""
        name = self.route53connection._make_qualified(name)
        for record in self.get_records():
            if record.name == name and record.type == 'CNAME':
                return record

    def get_a(self, name):
        """ Get the given A record."""
        name = self.route53connection._make_qualified(name)
        for record in self.get_records():
            if record.name == name and record.type == 'A':
                return record

    def get_mx(self):
        """ Get all MX records."""
        for record in self.get_records():
            if record.type == 'MX':
                return record

    def update_cname(self, name, value, ttl=None, comment=""):
        """ Update the given CNAME record to a new value and ttl."""
        name = self.route53connection._make_qualified(name)
        value = self.route53connection._make_qualified(value)
        old_record = self.get_cname(name)
        ttl = ttl or old_record.ttl
        return self.update_record(resource_type='CNAME',
                                  name=name,
                                  old_value=old_record.resource_records,
                                  new_value=value,
                                  old_ttl=old_record.ttl,
                                  new_ttl=ttl,
                                  comment=comment)

    def update_a(self, name, value, ttl=None, comment=""):
        """ Update the given A record to a new value and ttl."""
        name = self.route53connection._make_qualified(name)
        old_record = self.get_a(name)
        ttl = ttl or old_record.ttl
        return self.update_record(resource_type='A',
                                  name=name,
                                  old_value=old_record.resource_records,
                                  new_value=value,
                                  old_ttl=old_record.ttl,
                                  new_ttl=ttl,
                                  comment=comment)

    def update_mx(self, value, ttl=None, comment=""):
        """ Update the MX records to the new value and ttl."""
        value = self.route53connection._make_qualified(value)
        old_record = self.get_mx()
        ttl = ttl or old_record.ttl
        return self.update_record(resource_type='MX',
                                  name=self.name,
                                  old_value=old_record.resource_records,
                                  new_value=value,
                                  old_ttl=old_record.ttl,
                                  new_ttl=ttl,
                                  comment=comment)

    def delete_cname(self,name):
        """ Delete the given CNAME record for this zone."""
        record = self.get_cname(self.route53connection._make_qualified(name))
        return self.delete_record(resource_type=record.type,
                                  name=record.name,
                                  value=record.resource_records,
                                  ttl=record.ttl)

    def delete_a(self,name):
        """ Delete the given A record for this zone."""
        record = self.get_a(self.route53connection._make_qualified(name))
        return self.delete_record(resource_type=record.type,
                                  name=record.name,
                                  value=record.resource_records,
                                  ttl=record.ttl)

    def delete_mx(self):
        """ Delete all MX records for the zone."""
        record = self.get_mx()
        return self.delete_record(resource_type=record.type,
                                  name=record.name,
                                  value=record.resource_records,
                                  ttl=record.ttl)

    def get_records(self, type=None):
        """ Get a list of all records for this zone."""
        return self.route53connection.get_all_rrsets(self.id, type=type)

    def delete(self):
        """ Delete this zone."""
        self.route53connection.delete_hosted_zone(self.id)

    def get_nameservers(self):
        """ Get the list of nameservers for this zone."""
        return [record.resource_records for record in self.get_records() if record.type == 'NS']


class Status(object):
    def __init__(self, route53connection, change_dict):
        self.route53connection = route53connection
        for key in change_dict:
            if key == 'Id':
                self.__setattr__(key.lower(), change_dict[key].replace('/change/',''))
            else:
                self.__setattr__(key.lower(), change_dict[key])

    def update(self):
        """ Update the status of this request."""
        status = self.route53connection.get_change(self.id)['GetChangeResponse']['ChangeInfo']['Status']
        self.status = status
        return status

    def __repr__(self):
        return '<Status:%s>' % self.status

def patch(boto_module):
    boto_module.route53.connection.Route53Connection.get_zones = get_zones
    boto_module.route53.connection.Route53Connection.get_zone = get_zone
    boto_module.route53.connection.Route53Connection._make_qualified = _make_qualified
