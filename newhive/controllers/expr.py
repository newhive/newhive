import werkzeug.urls
import uuid
from md5 import md5
import subprocess
import os
from newhive.controllers.base import ModelController

class Expr(ModelController):
    model_name = 'Expr'

    def fetch(self, tdata, request, response, user, expr):
        expr_obj = self.db.Expr.named(user,expr)
        return self.serve_json(response,expr_obj)

    def fetch_naked(self, tdata, request, response, expr_id):
        print "host_url: ", request.host_url
        # Request must come from content_domain, as this serves untrusted content
        # TODO: get routing to take care of this
        if request.host.split(':')[0] != config.content_domain:
            return self.redirect('/')
        expr_obj = self.db.Expr.fetch(expr_id)
        response.context.update(
                html = self.expr_to_html(expr_obj)
                , expr = expr_obj
                , use_ga = False
                , expr_script = expr_obj.get('script')
                , expr_style = expr_obj.get('style'))
        return self.serve_page(tdata, response, 'pages/expr.html')
    
