from json import loads
from itertools import chain

from newhive.utils import now, lget, dfilter
import newhive.mail
from newhive import config
from newhive.controllers.controller import Controller

class Admin(Controller):
    def pre_dispatch(self, func, tdata, request, response, **args):
        if not tdata.context['flags'].get('admin'):
            return self.serve_404(tdata, request, response)
        return super(Admin, self).pre_dispatch(func, tdata, request, response, **args)
    
    def site_flags(self, tdata, request, response, **args):
        """ Serves data to render the set_flags page
            AND handles the response to set site_flags with form data
        """

        resp = {}
        print request.form
        if len(request.form.keys()):
            su = self.db.User.site_user
            new_flags = {}
            for k, v in request.form.items():
                l = v.split(",")
                new_flags[k] = l
            su.update(updated=False, site_flags=new_flags)
            # return self.serve_json(response, resp)

        flags = { k:','.join(v) for k,v in self.flags.items()}
        tdata.context.update(page_data={'site_flags': flags}, route_args=args)
        return self.serve_loader_page('pages/main.html', tdata, request, response)

    def query(self, tdata, request, response, json=False, **args):
        """ performs a generic mongo query on expr collection
            and serves a feed page of results
        """

        qargs = { 'q': '{}', 'at': '0', 'sort': 'updated', 'order': '-1' }
        qargs.update(dfilter(request.args, ['q', 'at', 'sort', 'order']))
        for k in ['at', 'limit', 'order']:
            if k in qargs: qargs[k] = int(qargs[k])
        qargs['q'] = loads(qargs['q'])

        res = self.db.Expr.search(qargs['q'], limit=20, skip=qargs['at'],
            sort=[(qargs['sort'], qargs['order'])])
        page_data = {
            'cards': [r.client_view() for r in res],
            'card_type': 'expr'
        }

        if json:
            return self.serve_json(response, page_data)
        else:
            tdata.context.update(page_data=page_data, route_args=args)
            return self.serve_loader_page('pages/main.html', tdata, request, response)