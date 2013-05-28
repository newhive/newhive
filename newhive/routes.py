from copy import deepcopy
import json, os.path

from newhive.utils import abs_url
from newhive import config

class RoutesManager(object):
    def __init__(self, routes_path='newhive/routes.json'):
        self.routes_obj = json.loads(
            open(os.path.join(config.src_home, routes_path), 'r').read())
    def get_routes(self):
        return deepcopy(self.routes_obj)
    def get_route_anchor_attrs(self, route_name, **kwargs):
        # For use inside of templates
        # Format {"key": "val"} to data-key="val"
        attributes = map(lambda x: ('data-'+x[0],x[1]),kwargs.iteritems())
        # Add href attribute for fallback
        href = self.routes_obj[route_name]['page_route']
        # Substitute <variable> names in href URL
        base_url = abs_url()
        # Trim trailing slash from abs_url(), if present
        if base_url[-1] == '/': base_url = base_url[:-1]
        for variable,replacement in kwargs.iteritems():
            href = href.replace('<%s>' % variable,replacement)
        attributes.append(('href',base_url + href))
        # Add data-route-name attribute
        attributes.append(('data-route-name',route_name))
        attributes_str = ' '.join(map(lambda x: '%s="%s"' % x,attributes))
        return attributes_str

Routes = RoutesManager()
