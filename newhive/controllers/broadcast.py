from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController

class BroadcastController(ApplicationController):
    def update(self, request, response, delete=False):
        entity = self.db.Expr.named(request.domain.lower(), request.path.lower())
        if not delete:
            s = self.db.Broadcast.create(request.requester, entity)
            if s:
                response.context['item'] = request.requester
                return self.render_template(response, 'partials/user_card.html')
            else:
                return False
        else:
           s = self.db.Broadcast.find(dict(initiator=request.requester.id, entity=entity.id))
           if s:
               res = s.delete()
               if not res['err']: return {'unstarred': request.requester.id}
           else:
               return {'unstarred': request.requester.id}
