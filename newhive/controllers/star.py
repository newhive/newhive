from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController

class StarController(ApplicationController):

    def star(self, request, response):
        if not request.requester and request.requester.logged_in: raise exceptions.BadRequest()
        parts = request.form.get('path').split('/')
        p1 = lget(parts, 1)
        if p1 in ["expressions", "starred", "listening"]:
            entity = self.db.User.find(dict(sites=request.domain.lower()))
        else:
            entity = self.db.Expr.named(request.domain.lower(), request.path.lower())
        if request.form.get('action') == "star":
            s = self.db.Star.new(request.requester, entity)
            if s or s.get('entity'):
              return 'starred'
            else:
              return False
        else:
           s = self.db.Star.find(dict(initiator=request.requester.id, entity=entity.id))
           if s:
               res = s.delete()
               if not res['err']: return 'unstarred'
           else:
               return 'unstarred'
