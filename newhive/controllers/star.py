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
        eid = request.form.get('entity')
        entity = self.db.Expr.fetch(eid)
        if not entity: entity = self.db.User.fetch(eid)
        if not entity: self.serve_404(request, response)

        s = self.db.Star.find({'initiator': request.requester.id, 'entity': entity.id})
        if request.form.get('action') == "star":
            if not s: s = self.db.Star.create(request.requester, entity)
            state = 'starred'
        elif request.form.get('action') == "unstar":
           if s: s.delete()
           state = 'unstarred'

        if request.form.get('dataType') == 'json':
            return {'state': state}
        else:
            if state == 'starred':
                response.context['item'] = request.requester
                return self.render_template(response, 'partials/user_card.html')
            elif state == 'unstarred':
                return {'unstarred': request.requester.id}
