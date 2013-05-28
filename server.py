#!/usr/bin/python
""" This Werkzeug server is used only for development and debugging """
import os, optparse, sys
from os.path  import dirname, exists, join, isfile
import OpenSSL.SSL as ssl
import newhive.config as config
from newhive.app import application
from werkzeug.serving import run_simple, make_ssl_devcert

# caution, broken in some obscure way
#def wsgi_no_cache(app):
#    def new_app(environ, start_response):
#        def new_start_response(status, headers, **args):    
#            headers.append(('Cache-Control', 'no-cache, no-store, must-revalidate'))
#            return start_response(status, headers, **args)
#        return app(environ, new_start_response)
#    return new_app

# undfortunately this doesn't work for static files
# (need to subclass the server for that), so use your own cache killing solution!
#if config.debug_mode: application = wsgi_no_cache(application)

# run_simple is not so simple
# also, SSL is broken in pip version of werkzeug. Use github version
if __name__ == '__main__':
    parser = optparse.OptionParser()
    parser.add_option("-p", "--port", action="store", type="int", dest="port")
    parser.add_option("-s", "--secure-port", action="store", type="int", dest="secure_port",
        help='Defaults to -p argument + 1 unless given --ssl-only')
    parser.add_option("--ssl-only", action="store_true", dest="ssl_only", default=False)
    parser.add_option("--plain-only", action="store_true", dest="plain_only", default=False)
    parser.add_option("--debug", action="store_true", dest="debug")
    parser.add_option("--secure", action="store_true", dest="secure", default=False)
    (options, args) = parser.parse_args()

    config.plain_port = options.port or config.plain_port
    #config.ssl_port = options.secure_port or options.port if options.ssl_only else options.port + 1
    config.always_secure = options.secure or config.always_secure
    config.debug_mode = options.debug or config.debug_mode
    config.webassets_debug = options.debug or config.webassets_debug
    config.interactive = True
    config.always_secure = options.secure or config.always_secure

    ssl_prefix = join(config.src_home, 'lib', 'tmp', 'ssl')
    if not isfile(ssl_prefix + '.key'):
        make_ssl_devcert(ssl_prefix, host='localhost', cn=None)
    ssl_context = ssl.Context(ssl.SSLv23_METHOD)
    ssl_context.use_certificate_file(ssl_prefix + '.crt')
    ssl_context.use_privatekey_file(ssl_prefix + '.key')

    def run_hive(port, ssl=False):
        run_simple(
            '0.0.0.0'
            , port
            , application
            , use_reloader = True
            , use_debugger = config.debug_mode
            , use_evalex = config.debug_unsecure # from werkzeug.debug import DebuggedApplication
            , static_files = { '/lib' : join(config.src_home, 'lib') }
            , ssl_context = ssl_context if ssl else None
            #, processes = 0
            )

    if options.secure:
        run_hive(config.ssl_port, True)
    elif options.plain_only:
        run_hive(config.plain_port)
    else:
        child = os.fork()
        if(child):
            run_hive(config.plain_port)
        else:
            run_hive(config.ssl_port, True)
