from json import loads, dumps
from itertools import chain

from newhive.utils import now, lget, dfilter
import newhive.mail
from newhive import config
from newhive.controllers.controller import Controller
from copy import deepcopy

class Admin(Controller):
    def pre_dispatch(self, func, tdata, **args):
        if not tdata.context['flags'].get('admin'):
            return self.serve_404(tdata)
        return super(Admin, self).pre_dispatch(func, tdata, **args)
    
    def site_flags(self, tdata, request, response, **args):
        """ Serves data to render the set_flags page
            AND handles the response to set site_flags with form data
        """

        resp = {}
        live_server = config.live_server and (config.dev_prefix != 'staging')
        flags_name = 'live_flags' if live_server else 'site_flags'

        if len(request.form.keys()): 
            print "Site_flags changed."
            print request.form

            su = self.db.User.site_user
            new_flags = deepcopy(config.site_flags)
            for k, v in request.form.items():
                l = v.split(",")
                if type(new_flags[k]) == dict:
                    new_flags[k]['values'] = l
                else:
                    new_flags[k] = l
            update = {flags_name: new_flags}
            su.update(updated=False, **update)

        new_flags = {k:v for k,v in config.global_flags.iteritems() 
            if k in config.site_flags}
        flags = dumps(new_flags)
        #{ k:','.join(v) for k,v in config.site_flags.items()}
        tdata.context.update(page_data={'site_flags': flags,
            'live_server': live_server}, route_args=args)
        return self.serve_page(tdata, 'pages/main.html')

    def version(self, tdata, request, response, **args):
        """ Prints server version information
        """

        resp = {}

        resp = { 'text_result': config.version }
        tdata.context.update(page_data=resp, route_args=args)
        return self.serve_page(tdata, 'pages/main.html')
        # return self.serve(response, resp)

    def add_featured_queue(self, tdata, request, response, **args):
        """ Adds an expression to the queue of new featured expressions
            Always called with ajax.
        """

        resp = {}
        expr_id = request.form.get('expr_id')

        self.db.User.root_user.add_to_collection(expr_id, "_featured", add_to_back=True)
        return self.serve_json(response, resp)

# TODO: for when we implement permissions on testing
    # def test_dialogs(self, tdata, request, response, **args):
    #     resp = {}
    #     return resp

