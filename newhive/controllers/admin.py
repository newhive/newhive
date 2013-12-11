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
        if len(request.form.keys()):
            print "Site_flags changed."
            print request.form

            su = self.db.User.site_user
            new_flags = {}
            for k, v in request.form.items():
                l = v.split(",")
                new_flags[k] = l
            su.update(updated=False, site_flags=new_flags)

        flags = { k:','.join(v) for k,v in self.flags.items()}
        tdata.context.update(page_data={'site_flags': flags}, route_args=args)
        return self.serve_loader_page('pages/main.html', tdata, request, response)

    def add_featured_queue(self, tdata, request, response, **args):
        """ Adds an expression to the queue of new featured expressions
            Always called with ajax.
        """

        resp = {}
        expr_id = request.form.get('expr_id')

        self.db.User.root_user.add_to_collection(expr_id, "_featured", add_to_back=True)
        return self.serve_json(response, resp)
