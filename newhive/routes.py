from copy import deepcopy
import json

from newhive.utils import abs_url

class RoutesManager(object):
    def __init__(self, routes_path='newhive/api_routes.json'):
        self.routes_obj = json.loads(open(routes_path,'r').read())
    def get_routes(self):
        return deepcopy(self.routes_obj)
    def get_route_anchor_attrs(self, route_name, **kwargs):
        # For use inside of templates
        # Format {"key": "val"} to data-key="val"
        attributes = map(lambda x: ('data-'+x[0],x[1]),kwargs.iteritems())
        # Add href attribute for fallback
        href = self.routes_obj[route_name]['pageRoute']
        # Substitute <variable> names in href URL
        for variable,replacement in kwargs.iteritems():
            href = href.replace('<%s>' % variable,replacement)
        attributes.append(('href',abs_url() + href))
        # Add data-route-name attribute
        attributes.append(('data-route-name',route_name))
        attributes_str = ' '.join(map(lambda x: '%s="%s"' % x,attributes))
        return attributes_str

Routes = RoutesManager()