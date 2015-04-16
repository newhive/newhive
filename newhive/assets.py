from os.path import dirname, join, abspath, normpath, isfile, isdir
import os, json, time, webassets, webassets.script, re
from boto.s3.key import Key as S3Key
from boto.s3.connection import S3Connection
from newhive import config
from newhive.s3 import S3Interface
from newhive.manage import git
from newhive.routes import Routes
from newhive.utils import lget, now, abs_url
from md5 import md5

import logging
logger = logging.getLogger(__name__)


class Assets(object):
    def __init__(self, asset_path, default_local=False):
        self.assets = {}
        self.bundles = {}
        self.base_path = normpath(join(config.src_home, asset_path))
        self.strip = len(self.base_path) + 1
        self.local_base_url = '/lib/' #re.sub('https?:', '', abs_url()) + 'lib/'
        self.default_local = False

        # TODO-cleanup: use S3Interface everywhere instead of s3_con
        if config.aws_id:
            self.s3_con = S3Connection(config.aws_id, config.aws_secret)
            self.asset_bucket = self.s3_con.get_bucket(
                config.s3_buckets.get('asset'))

            cloudfront = config.cloudfront_domains['asset']
            if cloudfront:
                self.base_url = '//' + cloudfront + '/'
            else:
                bucket_url = (self.asset_bucket.generate_url(0)
                    if config.aws_id else False)
                self.base_url = re.sub(r'^https?:', '',
                    bucket_url[0:bucket_url.index('?')])
        else:
            self.base_url = self.local_base_url

    # return (path, name) tuples
    def find(self, start_path='', recurse=True, local=None):
        actual_path = join(self.base_path, start_path)

        if isfile(actual_path): self.add_file(actual_path, local=local)
        elif isdir(actual_path):
            for dirname, subdirs, filenames in os.walk(join(self.base_path, start_path)):
                if not recurse: subdirs[:] = [] # slice prevents subdirs being clobbered with new list
                for n in filenames: self.add_file(join(dirname, n), local=local)
        else: raise Exception('Yo, this is not a file or directory: ' + actual_path)

        return self

    def add_file(self, path, local=None):
        name = path[self.strip:]
        if self.assets.get(name): return

        if local == None: local = self.default_local
        with open(path) as f: version = md5(f.read()).hexdigest()[:8]
        self.assets[name] = (path, version, local)

        return self

    # upload each asset
    def push_s3(self):
        print('Syncing all assets to s3...')
        for name, (path, version, local) in self.assets.iteritems():
            if not path or local: continue
            versioned_name = name + '.' + version
            if not S3Key(self.asset_bucket, versioned_name).exists():
                print 'uploading: ' + name
                k = S3Key(self.asset_bucket)
                k.name = versioned_name
                # assets expire 10 years from now (we rely on cache busting query string)
                headers = {
                    'Cache-Control': 'max-age=' + str(86400 * 3650)
                }
                if re.search(r'\.woff$', name):
                    headers['Content-Type'] = 'application/x-font-woff'
                if re.search(r'\.eot$', name):
                    headers['Content-Type'] = 'application/vnd.ms-fontobject'
                k.set_contents_from_filename(path, headers=headers)
                k.make_public()
        print("Done Syncing to s3")

        return self

    def url(self, name, abs=False, return_debug=True, http=False):
        if not name: return self.base_url
        props = self.assets.get(name)
        # TODO: return path of special logging 404 page if asset not found
        if props:
            url = ((self.local_base_url + name) if props[2] else
                (self.base_url + name + '.' + props[1]))
            if abs and re.match(r'/[^/]', url): url = abs_url() + url[1:]
            if http and url.startswith('//'): url = 'http:' + url
            return url
        elif return_debug:
            return '/not_found:' + name

    def bundle_urls(self, name):
        return self.bundles.get(name)

    def write_ruby(self, write_path):
        with open(join(config.src_home, write_path), 'w') as f:
            f.write(
                  '# Hey!\n'
                + '# This file is automatically generated by newhive.assets.Assets.write_ruby on server start\n\n'
                + 'Paths = {\n'
            )

            for name in self.assets:
                f.write('    "'+ name + '" => "' + self.url(name) + '",\n')

            f.write('}')

    # store a javascript object in source tree
    def write_js(self, obj, write_path):
        with open(join(config.src_home, write_path), 'w') as f:
            f.write(json.dumps(obj))

    def write_js_assets(self, write_path):
        urls = dict([(name, self.url(name)) for name in self.assets])
        urls[''] = self.base_url
        self.write_js(urls, write_path)

    def audit(self, limit=None):
        assets = sorted(self.assets.items())
        if limit: assets = assets[:limit]
        total = 0; valid = 0;
        for name, (path, version) in assets:
            total = total + 1
            key = self.asset_bucket.get_key(name)
            etag = key.etag.replace('"', '')[0:8]
            if key.exists:
                if etag == version:
                    valid = valid + 1
                    message = "OK:   MD5 match for: %s"
                else:
                    message = "FAIL: MD5 match for: %s"
            else:
                message     = "FAIL: %s does not exist"
            print message % (name)
        print "\nPassed %s/%s" % (valid, total)

    def system(self, *args):
        status = os.system(*args)
        if status != 0:
            raise Exception('Build command failed: ' + str(args))


class HiveAssets(Assets):
    def __init__(self):
        super(HiveAssets, self).__init__('lib')

    def build(self, force=False):
        self.webassets_init()

        print('Assembling hive assets...')

        ## First assemble hive assets that scss and JavaScript need

        # Assets with weird browser requirements need to be local (flash)
        # first grab assets for JavaScript
        self.find('Jplayer.swf', local=True)
        self.find('skin')
        self.write_js_assets('libsrc/server/compiled.assets.json')
        self.write_js(config.client_view(), 'libsrc/server/compiled.config.json')

        self.find('fonts')
        self.write_ruby('libsrc/scss/compiled.asset_paths.rb')
        
        self.webassets_bundle()

        print('Beginning asset build')
        t0 = time.time()
        if force or not config.debug_mode:
            self.assets_env.auto_build = False
            cmd = webassets.script.CommandLineEnvironment(self.assets_env, logger)
            print("Forcing rebuild of webassets")
            status = cmd.build()
            # returns false positive fails
            #if status != 0:
            #    raise Exception('Webassets build cmd failed. very sory :\'(')
        # actually get webassets to build bundles (webassets is very lazy)
        for b in self.final_bundles:
            print 'starting', b
            self.bundles[b] = self.assets_env[b].urls()
        #self.write_js(self.bundles, 'libsrc/server/compiled.bundles.json')
        print("Assets build complete in %s seconds", time.time() - t0)

        ## now grab the rest of 'em after compiling our webassets shit
        self.find('')

        if not config.debug_mode: self.push_s3()

    def bundle(self):
        if config.debug_mode: self.build()
        self.find('')

    def webassets_init(self):
        self.assets_env = webassets.Environment(join(config.src_home, 'libsrc'), '/lib')
        self.assets_env.updater = 'always'
        self.assets_env.url_expire = True

        if config.debug_mode:
            self.assets_env.debug = True
            self.assets_env.url = '/lib/libsrc'
            self.default_local = True
            self.auto_build = True

    def webassets_bundle(self):
        print('Bundling webassets...')

        opts = { }
        self.final_bundles = []

        # Note: IMPORTANT any time a file that is imported into other scss
        # files is changed (i.e. common.scss is imported into almost every
        # file), the webassets cache must be cleared
        
        # TODO: fix for source maps.
        # Sadly, the latest versions of sass do not work with compass
        # (Contrary to what compass says on their website)
        # sudo gem install sass
        # sudo gem install compass
        # sudo apt-get install ruby-full
        scss_filter = webassets.filter.get_filter(
            'scss',
            use_compass=True,
            # sourcemap=True,
            debug_info=config.debug_mode,
            libs=[join(config.src_home, 'libsrc/scss/asset_url.rb')]
        )

        app_scss = webassets.Bundle('scss/base.scss', "scss/fonts.scss",
            "scss/dialogs.scss", "scss/community.scss",
            "scss/settings.scss", "scss/signup_flow.scss", "scss/menu.scss",
            "scss/jplayer.scss", "scss/forms.scss", "scss/overlay.scss",
            "scss/skin.scss", 'scss/edit.scss', 'scss/codemirror.css',
            "scss/view.scss",
            filters=scss_filter,
            output='compiled.app.css',
            debug=False
        )
        self.assets_env.register(
            'app.css',
            app_scss,
            filters='yui_css',
            output='../lib/app.css'
        )
        self.final_bundles.append('app.css')

        # edit_scss = webassets.Bundle(
        #     'scss/edit.scss',
        #     'scss/codemirror.css',
        #     'scss/overlay',
        #     filters=scss_filter,
        #     output='compiled.edit.css',
        #     debug=False
        # )
        # self.assets_env.register(
        #     'edit.css',
        #     edit_scss,
        #     filters='yui_css',
        #     output='../lib/edit.css'
        # )
        # self.final_bundles.append('edit.css')

        self.assets_env.register('curl.js', 'curl.js',
            filters = 'yui_js',
            output = '../lib/curl.js'
        )

        # build cram bundles
        if not config.debug_mode:
            # can't figure out how to make cram work from another dir
            old_dir = os.getcwd()
            os.chdir(join(config.src_home, 'libsrc'))
            self.system('./cram.sh')
            os.chdir(old_dir)

            self.assets_env.register('site.js', 'compiled.site.js',
                filters = 'yui_js',
                output = '../lib/site.js'
            )
            self.final_bundles.append('site.js')

            self.assets_env.register('expr.js', 'compiled.expr.js',
                filters = 'yui_js',
                output = '../lib/expr.js'
            )
            self.final_bundles.append('expr.js')

            self.assets_env.register('edit.js', 'compiled.edit.js'
                ,filters = 'yui_js'
                ,output = '../lib/edit.js'
            )
            self.final_bundles.append('edit.js')

        # CSS for expressions, and also site pages
        minimal_scss = webassets.Bundle(
            'scss/minimal.scss',
            'scss/jplayer.scss',
            'scss/fonts.scss',
            filters=scss_filter,
            output='compiled.minimal.css',
            debug=False
        )
        self.assets_env.register('minimal.css',
            minimal_scss,
            filters='yui_css',
            output='../lib/minimal.css'
        )
        self.final_bundles.append('minimal.css')

        email_scss = webassets.Bundle(
            'scss/email.scss',
            filters=scss_filter,
            output='compiled.email.css',
            debug=False
        )
        self.assets_env.register('email.css', email_scss, output='../lib/email.css')
        self.final_bundles.append('email.css')

    def urls_with_expiry(self):
        urls = self.urls()
        if self.env.debug:
            rv = []
            for u in urls:
                parts = u.split('?')
                name = parts[0]
                query = lget(parts, 1)
                if not query:
                    query = str(int(os.stat(config.src_home + name).st_mtime))
                rv.append(name + '?' + query)
            return rv
        else:
            return urls

    webassets.bundle.Bundle.urls_with_expiry = urls_with_expiry

    def asset_bundle(self, name):
        if config.debug_mode: return self.assets_env[name].urls_with_expiry()
        else: return [self.url(name)]
