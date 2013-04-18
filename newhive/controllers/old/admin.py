from newhive.controllers.shared import *
from newhive.controllers import Application
import newhive.auth
from newhive import mail
from werkzeug import Response

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
            if not user: return self.serve_404(request, response)
            if request.args.get('delete'):
                user.delete()
                return self.serve_json(response, True)
            expressions = self.db.Expr.search(dict(owner=user.id))
            public_expressions = user.get_expressions(auth="public")
            private_expressions = user.get_expressions(auth="password")
            response.context['user_object'] = user
            response.context['public_expressions'] = public_expressions
            response.context['private_expressions'] = private_expressions
            response.context['action_log'] = self.db.ActionLog.search({
                'user': user.id
                , 'created': {'$gt': time.time() - 60*60*24*30}
                }, sort=[('created', -1)], limit=200)
            response.context['expression_counts'] = {
                    'public': public_expressions.count()
                    , 'private': private_expressions.count()
                    }
            return self.serve_page(response, 'pages/admin/user.html')

    # Facilitates testing user-specific bugs.  Only use with permission of user!
    @admins
    def log_in_as(self, request, response):
        user = request.args.get('user')
        user = self.db.User.named(user)
        newhive.auth.new_session(self.db, user, request, response)
        return self.redirect(response, AbsUrl(user['name'] + '/profile'))

    @admins
    def add_referral(self, request, response):
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
        form = request.form.copy()
        mailer = mail.SiteReferral(db=self.db, jinja_env=self.jinja_env)
        for key in form:
            parts = key.split('_')
            if parts[0] == 'check':
                id = parts[1]
                contact = self.db.Contact.fetch(id)
                name = form.get('name_' + id)
                if contact.get('email'):
                    referral_id = mailer.send(contact['email'], name)
                    if referral_id:
                        contact.update(referral_id=referral_id)
                    else:
                        print "email not sent to " + contact['email'] + " referral already exists"

    @admins
    def admin_update(self, request, response):
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
            args = request.args.copy()
            query = {
                    'created': {'$exists': True}
                    , '$or': [{'dev_prefix': {'$exists': False}}, {'dev_prefix': config.dev_prefix}]
                    }
            page = int(args.pop('page', 1))
            if args.has_key('before'): query['created'] = {'$lt': float(args.pop('before'))}
            if args.has_key('after'): query['created'] = {'$gt': float(args.pop('after'))}
            query.update(args.to_dict())
            count = self.db.ErrorLog.count({})
            page_size = 200
            errors = list(self.db.ErrorLog.search(query, sort=[('created', -1)], limit=page_size))
            response.context['page'] = page
            if len(errors):
                response.context['newer'] = {'exists': page > 1, 'date': errors[0]['created'], 'page': page - 1}
                response.context['older'] = {'exists': page*page_size < count, 'date': errors[-1]['created'], 'page': page + 1}
            else:
                response.context['newer'] = {'exists': False}
                response.context['older'] = {'exists': False}

            response.context['errors'] = errors
            #response.context['summary'] = self._error_summary(errors)

            return self.serve_page(response, 'pages/admin/error_log.html')

    def _error_summary(self, errors):
        start = datetime.datetime.fromtimestamp(errors[-1])
        start.replace(hour=8, minute=0, second=0, microsecond=0)
        end = datetime.datetime.fromtimestamp(errors[0])
        date_range = pandas.DateRange(start=start, end=end, offset=pandas.DateOffset(hours=6))
        times = [datetime.datetime.fromtimestamp(e['created']) for e in errors]
        data = pandas.Series(1, times)
        data = pandas.Series(data.groupby(date_range.asof).sum())
        data = data.reindex(index=date_range, fill_value=0)
        return {
            'times': [time.mktime(x.timetuple()) for x in date_range.tolist()]
            , 'counts': data.values.tolist()
            }

    @admins
    def _index(self, request, response):
        logger.debug('_index')
        return self.redirect(response, abs_url(secure=True) + "thenewhive/admin")

    @admins_insecure
    def add_to_featured(self, request, response):
        root = self.db.User.get_root()
        root['tagged']['_Featured'] = [request.form.get('id')] + root['tagged'].get('_Featured', [])
        root.save(updated=False)
        return self.serve_json(response, True)

    @admins
    def featured(self, request, response):
        root = self.db.User.get_root()
        response.context.update({
            'provisionary': self.db.Expr.fetch(root['tagged'].get('_Featured')) or []
            , 'featured': self.db.Expr.fetch(root['tagged'].get('Featured')) or []
            })
        return self.serve_page(response, 'pages/admin/featured.html')

    @admins
    def update_featured(self, request, response):
        root = self.db.User.get_root()
        new_featured = uniq(request.form.get('featured').split(','))
        if new_featured:
            new_set = set(new_featured)
            old_set = set(root['tagged']['Featured'])
            mailer = mail.Featured(db=self.db, jinja_env=self.jinja_env)
            for id in new_set.difference(old_set):
                mailer.send(self.db.Expr.fetch(id))
            root['tagged']['_Featured'] = []
            root['tagged']['Featured'] = new_featured
            root.save(updated=False)
        return self.serve_json(response, True)

    def www_tmp(self, request, response):
        fil = file(config.src_home + '/www_tmp/' + request.path.split('/', 1)[1])
        res = Response(fil, direct_passthrough=True)
        res.content_type = 'text/html; charset=utf-8'
        return res
