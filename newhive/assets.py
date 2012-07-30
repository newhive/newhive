from os.path import dirname, join, abspath, normpath, isfile, isdir
import os, json, time, webassets, webassets.script, re
from boto.s3.key import Key as S3Key
from boto.s3.connection import S3Connection
from newhive import config
from newhive.manage import git
from newhive.utils import lget, now, abs_url
from md5 import md5

import logging
logger = logging.getLogger(__name__)


class Assets(object):
    def __init__(self, asset_path, default_local=False):
        self.assets = {}
        self.base_path = normpath(join(config.src_home, asset_path))
        self.strip = len(self.base_path) + 1

        self.s3_con = S3Connection(config.aws_id, config.aws_secret)
        self.asset_bucket = self.s3_con.create_bucket(config.asset_bucket)
        bucket_url = self.asset_bucket.generate_url(0)
        self.base_url = bucket_url[0:bucket_url.index('?')]
        self.local_base_url = '/lib/' #re.sub('https?:', '', abs_url()) + 'lib/'
        self.default_local = False

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
        versions_key_name = '.versions.json'
        versions_key = self.asset_bucket.get_key(versions_key_name)
        old_versions = json.loads(versions_key.get_contents_as_string()) if versions_key else {}
        if not versions_key:
            versions_key = S3Key(self.asset_bucket)
            versions_key.name = versions_key_name

        print('Syncing all assets to s3...')
        for name, (path, version, local) in self.assets.iteritems():
            if not path or local: continue
            if version != old_versions.get(name):
                print 'uploading: '+ name
                k = S3Key(self.asset_bucket)
                k.name = name
                # assets expire 10 years from now (we rely on cache busting query string)
                k.set_contents_from_filename(path, headers={'Cache-Control': 'max-age=' + str(86400 * 3650) })
                k.make_public()
        print("Done Syncing to s3")

        new_versions = dict([(r[0], r[1][1]) for r in self.assets.iteritems()]) # make name: version dict
        versions_key.set_contents_from_string(json.dumps(new_versions))

        return self

    def url(self, name):
        props = self.assets.get(name)
        # TODO: return path of special logging 404 page if asset not found
        if not props: return '/not_found:' + name
        return (self.local_base_url if props[2] else self.base_url) + name + '?' + props[1]

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
    
    def write_js(self, write_path):
        urls = dict([(name, self.url(name)) for name in self.assets])
        urls[''] = self.base_url
        with open(join(config.src_home, write_path), 'w') as f:
            f.write(
                  '// Hey!\n'
                + '// This file is automatically generated by newhive.assets.Assets.write_js on server start\n\n'
                + 'var hive_asset_paths = ' + json.dumps(urls) +';'
            )

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


class HiveAssets(Assets):

    def __init__(self):
        super(HiveAssets, self).__init__('lib')

    def build(self, force=False):
        self.webassets_init()

        print('Assembling hive assets...')

        ## First assemble hive assets that scss and JavaScript need

        # Assets with weird browser requirements need to be local (fonts and flash)
        # first grab assets for JavaScript
        self.find('Jplayer.swf', local=True)
        self.find('skin')
        self.write_js('libsrc/compiled.asset_paths.js')

        # Fonts are NOT handled by hive assets for now
        # fonts must have absolute SSL paths (css is served from s3)
        self.find('fonts', local=True) # prevent fonts from being uploaded to s3
        self.write_ruby('libsrc/scss/compiled.asset_paths.rb')
        
        self.webassets_bundle()

        if force or not config.debug_mode:
            self.assets_env.auto_build = False
            cmd = webassets.script.CommandLineEnvironment(self.assets_env, logger)

            print("Forcing rebuild of webassets"); t0 = time.time()
            cmd.build()
            # actually get webassets to build bundles (webassets is very lazy)
            for b in self.final_bundles: self.assets_env[b].urls()
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

        self.assets_env.register('edit.js',
            'filedrop.js', 'upload.js', 'editor.js', 'jplayer/skin.js',
            filters='yui_js',
            output='../lib/edit.js'
            )

        self.assets_env.register('google_closure.js', 'google_closure.js',
            filters = 'yui_js',
            output = '../lib/google_closure.js'
            )

        self.assets_env.register('app.js',
            'jquery_misc.js', 'colors.js', 'rotate.js', 'hover.js', 'drag.js', 'dragndrop.js',
            'compiled.asset_paths.js', 'jplayer/jquery.jplayer.js', 'Modernizr.js', 'util.js',
            'nav.js', 'navigator.js', 'URI.js', 'history/history.js', 'history/history.html4.js',
            'history/history.adapter.jquery.js', 'jquery.transition.js',
            filters='yui_js',
            output='../lib/app.js'
            )

        self.assets_env.register('harmony_sketch.js',
            'harmony_sketch.js',
            filters='yui_js',
            output='../lib/harmony_sketch.js'
            )

        self.assets_env.register('admin.js',
            'raphael/raphael.js', 'raphael/g.raphael.js', 'raphael/g.pie.js',
            'raphael/g.line.js', 'jquery.tablesorter.min.js',
            'jquery-ui/jquery-ui-1.8.16.custom.min.js', 'd3/d3.js', 'd3/d3.time.js',
            output='../lib/admin.js'
            )

        self.assets_env.register('admin.css',
            'jquery-ui/jquery-ui-1.8.16.custom.css',
            output='../lib/admin.css'
            )

        # Note: IMPORTANT any time a file that is imported into other scss
        # files is changed (i.e. common.scss is imported into almost every
        # file), the webassets cache must be cleared
        scss_filter = webassets.filter.get_filter('scss', use_compass=True, debug_info=False,
            libs=[join(config.src_home, 'libsrc/scss/asset_url.rb')])
        app_scss = webassets.Bundle('scss/base.scss', "scss/fonts.scss", "scss/nav.scss",
            "scss/dialogs.scss", "scss/community.scss", "scss/cards.scss",
            "scss/expression.scss", "scss/settings.scss", "scss/signup_flow.scss",
            "scss/chart.scss", "scss/jplayer.scss", "scss/navigator.scss",
            filters=scss_filter,
            output='scss.css',
            debug=False
            )

        edit_scss = webassets.Bundle('scss/edit.scss',
            filters=scss_filter,
            output='edit.css',
            debug=False
            )

        minimal_scss = webassets.Bundle('scss/minimal.scss',
            'scss/fonts.scss',
            filters=scss_filter,
            output='minimal.css',
            debug=False
            )

        self.assets_env.register('app.css', app_scss, filters='yui_css', output='../lib/app.css')
        self.assets_env.register('edit.css', edit_scss, filters='yui_css', output='../lib/edit.css')
        self.assets_env.register('minimal.css', minimal_scss, filters='yui_css', output='../lib/minimal.css')
        self.assets_env.register('expression.js', 'expression.js', filters='yui_js', output='../lib/expression.js')

        self.final_bundles = [
            'app.css',
            'edit.css',
            'minimal.css',
            'expression.js',
            'edit.js',
            'google_closure.js',
            'app.js',
            'harmony_sketch.js',
            'admin.js',
            'admin.css']

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
