from newhive.controllers.shared import *
from newhive.controllers import Application
from newhive import utils, mail

class Feed(Application):

    def star(self, request, response):
        """Star/listen or unstar/unlisten an expression or profile
        """
        eid = request.form.get('entity')
        entity = self.db.Expr.fetch(eid)
        if not entity: entity = self.db.User.fetch(eid)
        if not entity: return self.serve_404(request, response)

        s = self.db.Star.find({'initiator': request.requester.id, 'entity': entity.id})
        if request.form.get('state') == 'false':
            if s: s.delete()
            state = False
        else:
            if not s: s = self.db.Star.create(request.requester, entity)
            state = True

        print entity['name'], state
        return { 'state': state }

    def broadcast(self, request, response):
        entity = self.db.Expr.fetch(request.form.get('entity'))
        if not entity: return self.serve_404(request, response)

        s = self.db.Broadcast.find({ 'initiator': request.requester.id, 'entity': entity.id })
        if request.form.get('state') == 'false':
           if s: res = s.delete()
           state = False
        else:
           if not s: s = self.db.Broadcast.create(request.requester, entity)
           state = True

        return { 'state': state }

    def comment(self, request, response):
        user = request.requester
        expr = self.db.Expr.fetch(request.form.get('entity'))
        if not expr: return self.serve_404(request, response)
        text = request.form.get('text')
        if text.strip() == '': return False

        comment = self.db.Comment.create(user, expr, {'text': text})
        if user.id != expr.owner.id:
            mail.Feed(db=self.db, jinja_env=self.jinja_env).send(comment)
        comment['initiator_thumb'] = user.get_thumb(70)
        response.context['comment'] = comment
        return comment
