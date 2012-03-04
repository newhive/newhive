from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController

class StarController(ApplicationController):

    def star(self, request, response):
        """Star/listen or unstar/unlisten an expression or profile

        When starring, returns an html 'user_card' representing the
        starrer/listener.  When unstarrring, returns json of the form
        {unstarred: unstarrer.id}
        """

        if not request.requester and request.requester.logged_in: raise exceptions.BadRequest()
        path = request.form.get('path')
        if path:
            parts = path.split('/')
            p1 = lget(parts, 1)
        entity = request.form.get('entity')
        entity_class = request.form.get('entity_class')
        if entity:
            if entity_class == 'Expr':
                entity = self.db.Expr.fetch(entity)
            elif entity_class == 'User':
                entity = self.db.User.fetch(entity)
        elif p1 in ["expressions", "starred", "listening"]: #Means we're on profile
            entity = self.db.User.find(dict(sites=request.domain.lower()))
        else:
            entity = self.db.Expr.named(request.domain.lower(), request.path.lower())

        if request.form.get('action') == "star":
            s = self.db.Star.create(request.requester, entity)
            if s or s.get('entity'):
                response.context['user'] = request.requester
                return self.render_template(response, 'partials/user_card.html')
            else:
                return False
        else:
           s = self.db.Star.find(dict(initiator=request.requester.id, entity=entity.id))
           if s:
               res = s.delete()
               if not res['err']: return {'unstarred': request.requester.id}
           else:
               return {'unstarred': request.requester.id}
