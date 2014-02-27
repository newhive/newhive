from copy import deepcopy
import json, os.path

from newhive.utils import abs_url
from newhive import config

reserved_words = ['home', 'profile', 'expr']

class RoutesManager(object):
    def __init__(self, routes_path='newhive/routes.json'):
        self.routes_obj = json.loads(
            open(os.path.join(config.src_home, routes_path), 'r').read())
    def get_routes(self):
        routes_dict = deepcopy(self.routes_obj)
        routes_list = []
        for k, v in routes_dict.items():
            v.setdefault('precedence', 0)
            v.update(route_name=k)
            routes_list.append(v)
        routes_list.sort(reverse=True, key=lambda r: r['precedence'])
        return routes_list

Routes = RoutesManager()

