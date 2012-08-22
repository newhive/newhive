from newhive.controllers.shared import *
from newhive.controllers import Application
from newhive.mail import site_referral
import logging
logger = logging.getLogger(__name__)

class Admin(Application):

    @admins
    def contact_log(self, request, response):
        response.context['contacts'] = self.db.Contact.page({}, limit=500, sort='created')
        return self.serve_page(response, 'pages/admin/contact_log.html')

    @admins
    def referrals(self, request, response):
        response.context['users'] = self.db.User.search({})
        return self.serve_page(response, 'pages/admin/referrals.html')

    @admins
    def thumbnail_relink(self, request, response):
        return self.serve_html(response, 'thumbnail relink is deprecated')
        response.context['exprs'] = []
        exprs = self.db.Expr.search({'thumb': {'$exists': True, '$ne': None}, 'thumb_file_id': {'$exists': False}})
        if len(exprs) > 200:
            exprs = exprs[0:100]
        for e in exprs:
            image_apps = filter(lambda i: i.get('type') == 'hive.image', e.get('apps'))
            image_apps = [self.db.File.fetch(image.get('file_id')) for image in image_apps]
            response.context['exprs'].append({'id': e.id, 'url': e.url, 'thumb': e.get('thumb'), 'images': image_apps})
        return self.serve_page(response, 'pages/admin/thumbnail_relink.html')

    @admins
    def tags(self, request, response):
        popular_tags = self.db.Expr.popular_tags()
        response.context['featured_tags'] = self.db.User.site_user['config']['featured_tags']
        response.context['popular_tags'] = popular_tags[0:100]
        return self.serve_page(response, 'pages/admin/tags.html')

    @admins
    def users(self, request, response):
        p3 = lget(request.path.split('/'), 2)
        if not p3:
            response.context['users'] = self.db.User.search({})
            return self.serve_page(response, 'pages/admin/users.html')
        else:
            user = self.db.User.named(p3)
            expressions = self.db.Expr.search(dict(owner=user.id))
            public_expressions = filter(lambda e: e.get('auth') == 'public', expressions)
            private_expressions = filter(lambda e: e.get('auth') == 'password', expressions)
            response.context['user_object'] = user
            response.context['public_expressions'] = public_expressions
            response.context['private_expressions'] = private_expressions
            response.context['action_log'] = self.db.ActionLog.search(dict(user=user.id, created={'$gt': time.time() - 60*60*24*30}))
            response.context['expression_counts'] = {'public': len(public_expressions), 'private': len(private_expressions), 'total': len(expressions)}
            return self.serve_page(response, 'pages/admin/user.html')

    @admins
    def add_referral(self, request, response):
        if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
        form = request.form.copy()
        action = form.pop('action')
        number = int(form.pop('number'))
        forward = form.pop('forward')
        if form.get('all'):
            users = self.db.User.search({});
        else:
            users = []
            for key in form:
                users.append(self.db.User.fetch(key))

        for user in users: user.give_invites(number)

        return self.redirect(response, forward)

    @admins
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
                    referral_id = site_referral(self.jinja_env, self.db, contact['email'], name)
                    if referral_id:
                        contact.update(referral_id=referral_id)
                    else:
                        print "email not sent to " + contact['email'] + " referral already exists"

    @admins
    def admin_update(self, request, response):
        if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
        for k in ['tags', 'tagged']:
            v = json.loads(request.form.get(k))
            if v: self.db.User.get_root().update(**{ k : v })
        featured_tags = json.loads(request.form.get('featured_tags'))
        site_user = self.db.User.site_user
        site_user['config']['featured_tags'] = featured_tags
        site_user.save()

    @admins
    def home(self, request, response):
        root = self.db.User.get_root()
        if not request.requester['name'] in config.admins: raise exceptions.BadRequest()
        response.context['tags_js'] = json.dumps(root.get('tags'))
        response.context['tagged_js'] = json.dumps(root.get('tagged'), indent=2)
        response.context['featured_tags_js'] = json.dumps(self.db.User.site_user['config']['featured_tags'])

        # TODO: revamp the admin home page so we can interactively click expressions to add to featured, etc
        #expr_home_list(p2, request, response, limit=900) 
        return self.serve_page(response, 'pages/admin_home.html')

    @admins
    def contacts(self, request, response):
        response.headers.add('Content-Disposition', 'inline', filename='contacts.csv')
        response.data = "\n".join([','.join(map(json.dumps, [o.get('name'), o.get('email'), o.get('referral'), o.get('message'), o.get('url'), str(time_u(int(o['created'])))])) for o in self.db.Contact.search({})])
        response.content_type = 'text/csv; charset=utf-8'
        return response

    @admins
    def error_log(self, request, response):
        id = lget(request.path.split('/'), 2)
        if id:
            def format_frame(original_frame):
                frame = {'filename': '', 'lineno': '', 'function_name': ''}
                frame.update(original_frame)
                return '  File "%(filename)s", line %(lineno)s, in %(function_name)s\n    ' % frame + frame.get('current_line', '').strip()

            response.context['error'] = self.db.ErrorLog.find({'_id': id})
            response.context['traceback'] = '\n'.join([format_frame(frame) for frame in response.context['error'].get('stack_frames')])

            return self.serve_page(response, 'pages/admin/error.html')
        else:
            query = {
                    'created': {'$exists': True}
                    , '$or': [{'dev_prefix': {'$exists': False}}, {'dev_prefix': config.dev_prefix}]
                    }
            page = int(request.args.get('page', 1))
            if request.args.has_key('before'): query['created'] = {'$lt': float(request.args.get('before'))}
            if request.args.has_key('after'): query['created'] = {'$gt': float(request.args.get('after'))}
            count = self.db.ErrorLog.count({})
            page_size = 500
            errors = list(self.db.ErrorLog.search(query, sort=[('created', -1)], limit=page_size))
            response.context['page'] = page
            response.context['newer'] = {'exists': page > 1, 'date': errors[0]['created'], 'page': page - 1}
            response.context['older'] = {'exists': page*page_size < count, 'date': errors[-1]['created'], 'page': page + 1}
            response.context['errors'] = errors
            return self.serve_page(response, 'pages/admin/error_log.html')

    @admins
    def _index(self, request, response):
        logger.debug('_index')
        return self.redirect(response, abs_url(secure=True, subdomain="thenewhive") + 'admin')
