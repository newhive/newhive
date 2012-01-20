from newhive.controllers.shared import *
from newhive.controllers.application import ApplicationController

class AdminController(ApplicationController):

    def contact_log(self, request, response):
        response.context['contacts'] = self.db.Contact.search()
        return self.serve_page(response, 'pages/admin/contact_log.html')

    def referrals(self, request, response):
        response.context['users'] = self.db.User.search()
        return self.serve_page(response, 'pages/admin/referrals.html')

    def thumbnail_relink(self, request, response):
        response.context['exprs'] = []
        exprs = self.db.Expr.search(**{'thumb': {'$exists': True, '$ne': None}, 'thumb_file_id': {'$exists': False}})
        if len(exprs) > 200:
            exprs = exprs[0:100]
        for e in exprs:
            image_apps = filter(lambda i: i.get('type') == 'hive.image', e.get('apps'))
            image_apps = [self.db.File.fetch(image.get('file_id')) for image in image_apps]
            response.context['exprs'].append({'id': e.id, 'url': e.url, 'thumb': e.get('thumb'), 'images': image_apps})
        return self.serve_page(response, 'pages/admin/thumbnail_relink.html')

    def tags(self, request, response):
        popular_tags = self.db.Expr.popular_tags()
        response.context['popular_tags'] = popular_tags[0:100]
        return self.serve_page(response, 'pages/admin/tags.html')

    def users(self, request, response):
        p3 = lget(request.path.split('/'), 2)
        if not p3:
            response.context['users'] = self.db.User.search()
            return self.serve_page(response, 'pages/admin/users.html')
        else:
            user = self.db.User.named(p3)
            expressions = self.db.Expr.search(owner=user.id)
            public_expressions = filter(lambda e: e.get('auth') == 'public', expressions)
            private_expressions = filter(lambda e: e.get('auth') == 'password', expressions)
            response.context['user_object'] = user
            response.context['public_expressions'] = public_expressions
            response.context['private_expressions'] = private_expressions
            response.context['action_log'] = self.db.ActionLog.search(user=user.id, created={'$gt': time.time() - 60*60*24*30})
            response.context['expression_counts'] = {'public': len(public_expressions), 'private': len(private_expressions), 'total': len(expressions)}
            return self.serve_page(response, 'pages/admin/user.html')

    def add_referral(self, request, response):
        if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
        form = request.form.copy()
        action = form.pop('action')
        number = int(form.pop('number'))
        forward = form.pop('forward')
        if form.get('all'):
            users = self.db.User.search();
        else:
            users = []
            for key in form:
                users.append(self.db.User.fetch(key))

        for user in users: user.give_invites(number)

        return self.redirect(response, forward)

    def bulk_invite(self, request, resposne):
        if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
        form = request.form.copy()
        for key in form:
            parts = key.split('_')
            if parts[0] == 'check':
                id = parts[1]
                contact = self.db.Contact.fetch(id)
                name = form.get('name_' + id)
                if contact.get('email'):
                    referral_id = mail_invite(self.jinja_env, self,db, contact['email'], name)
                    if referral_id:
                        contact.update(referral_id=referral_id)
                    else:
                        print "email not sent to " + contact['email'] + " referral already exists"

    def admin_update(self, request, response):
        if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
        for k in ['tags', 'tagged']:
            v = json.loads(request.form.get(k))
            if v: self.db.User.get_root().update(**{ k : v })

    def home(self, request, response):
        root = self.db.User.get_root()
        if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
        response.context['tags_js'] = json.dumps(root.get('tags'))
        response.context['tagged_js'] = json.dumps(root.get('tagged'), indent=2)

        # TODO: revamp the admin home page so we can interactively click expressions to add to featured, etc
        #expr_home_list(p2, request, response, limit=900) 
        return self.serve_page(response, 'pages/admin_home.html')

    def contacts(self, request, response):
        response.headers.add('Content-Disposition', 'inline', filename='contacts.csv')
        response.data = "\n".join([','.join(map(json.dumps, [o.get('name'), o.get('email'), o.get('referral'), o.get('message'), o.get('url'), str(time_u(int(o['created'])))])) for o in self.db.Contact.search()])
        response.content_type = 'text/csv; charset=utf-8'
        return response
