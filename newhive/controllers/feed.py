from newhive.controllers.shared import *
from newhive.controllers import Application
from newhive import utils, mail

class Feed(Application):

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

    def broadcast(self, request, response):
        entity = self.db.Expr.named(request.owner['name'], request.path.lower())
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

    def comment(self, request, response):
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'x-requested-with')
        commenter = request.requester
        expression = self.db.Expr.fetch(request.form.get('expression'))
        comment_text = request.form.get('comment')
        comment = self.db.Comment.create(commenter, expression, {'text': comment_text})
        if comment.initiator.id != expression.owner.id:
            mail.mail_feed(self.jinja_env, comment, expression.owner)
        response.context['comment'] = comment
        return self.serve_page(response, 'partials/comment.html')

