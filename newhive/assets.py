from os.path import dirname, join, abspath, normpath
import os
import json
import time
import webassets
import webassets.script
from boto.s3.key import Key as S3Key
from boto.s3.connection import S3Connection
from newhive import config
from newhive.manage import git
from newhive.utils import lget, now
from md5 import md5

import logging
logger = logging.getLogger(__name__)

class Assets(object):
    def __init__(self, asset_path):
        self.base_path = normpath(join(config.src_home, asset_path))
        self.assets = {}

        self.s3_con = S3Connection(config.aws_id, config.aws_secret)
        self.asset_bucket = self.s3_con.create_bucket(config.asset_bucket)
        bucket_url = self.asset_bucket.generate_url(0)
        self.base_url = bucket_url[0:bucket_url.index('?')]

    # return (path, name) tuples
    def find(self, start_path='', recurse=True):
        strip = len(self.base_path) + 1

        for dirname, subdirs, filenames in os.walk(join(self.base_path, start_path)):
            if not recurse: subdirs[:] = [] # slice prevents subdirs being clobbered with new list
            for n in filenames:
                path = join(dirname, n)
                name = path[strip:]
                with open(path) as f: version = md5(f.read()).hexdigest()[:8]
                self.assets[name] = (path, version)

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
        for name, (path, version) in self.assets.iteritems():
            if not path: continue
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
        path = self.base_url + name
        return path + '?' + props[1]

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

    def bundle_and_compile(self):
        self.write_ruby('libsrc/scss/compiled.asset_paths.rb')
        self.write_js('libsrc/compiled.asset_paths.js')

        assets_env = webassets.Environment(join(config.src_home, 'libsrc'), '/lib')
        self.assets_env = assets_env
        assets_env.updater = 'always'
        assets_env.url_expire = True

        # get assets that webasset bundles depend on (just images and fonts), generate scss include
        print('Fetching assets for scss...')
        hive_assets = self.find('skin').find('fonts').find('images')

        if config.debug_mode:
            assets_env.debug = True
            assets_env.url = '/lib/libsrc'
            hive_assets.base_url = '/lib/'

        hive_assets.write_ruby('libsrc/scss/compiled.asset_paths.rb')
        hive_assets.write_js('libsrc/compiled.asset_paths.js')

        print('Compiling css and js...')
        assets_env.register('edit.js', 'filedrop.js', 'upload.js', 'editor.js', 'jplayer/skin.js', filters='yui_js', output='../lib/edit.js')
        assets_env.register('app.js', 'jquery_misc.js', 'util.js', 'rotate.js', 'hover.js', 'drag.js', 'dragndrop.js',
            'compiled.asset_paths.js', 'jplayer/jquery.jplayer.js', 'colors.js', filters='yui_js', output='../lib/app.js')
        assets_env.register('harmony_sketch.js', 'harmony_sketch.js', filters='yui_js', output='../lib/harmony_sketch.js')

        assets_env.register('admin.js', 'raphael/raphael.js', 'raphael/g.raphael.js', 'raphael/g.pie.js', 'raphael/g.line.js', 'jquery.tablesorter.min.js', 'jquery-ui/jquery-ui-1.8.16.custom.min.js', 'd3/d3.js', 'd3/d3.time.js', output='../lib/admin.js')
        assets_env.register('admin.css', 'jquery-ui/jquery-ui-1.8.16.custom.css', output='../lib/admin.css')

        scss_filter = webassets.filter.get_filter('scss', use_compass=True, debug_info=False,
            libs=[join(config.src_home, 'libsrc/scss/asset_url.rb')])
        app_scss = webassets.Bundle('scss/base.scss', "scss/fonts.scss", "scss/nav.scss",
            "scss/dialogs.scss", "scss/community.scss", "scss/cards.scss",
            "scss/feed.scss", "scss/expression.scss", "scss/settings.scss",
            "scss/signup_flow.scss", "scss/chart.scss", "scss/jplayer.scss",
            filters=scss_filter,
            output='scss.css',
            debug=False)
        edit_scss = webassets.Bundle('scss/edit.scss', filters=scss_filter, output='edit.css', debug=False)
        minimal_scss = webassets.Bundle('scss/minimal.scss', 'scss/fonts.scss', filters=scss_filter, output='minimal.css', debug=False)

        assets_env.register('app.css', app_scss, filters='yui_css', output='../lib/app.css')
        assets_env.register('edit.css', edit_scss, filters='yui_css', output='../lib/edit.css')
        assets_env.register('minimal.css', minimal_scss, filters='yui_css', output='../lib/minimal.css')
        assets_env.register('expression.js', 'expression.js', filters='yui_js', output='../lib/expression.js')

        if not config.debug_mode:
            assets_env.auto_build = False
            cmd = webassets.script.CommandLineEnvironment(assets_env, logger)
            logger.info("Forcing rebuild of webassets"); t0 = time.time()
            cmd.build()
            logger.info("Assets build complete in %s seconds", time.time() - t0)

        # add the assets we just compiled, and some other misc. assets, push to s3
        hive_assets.find(recurse=False).find('doc')

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
