#! /usr/bin/python
import os, optparse, sys
from os.path  import dirname, exists, join as joinpath
import newhive.config as config
from newhive.wsgi import application


# run_simple is not so simple
# also, SSL is broken
if __name__ == '__main__':
    with open('log/newhive.log', 'a') as log: log.write("\n*****Server Start*****\n\n")
    parser = optparse.OptionParser()
    parser.add_option("-p", "--port", action="store", type="int", dest="port")
    #parser.add_option("-s", "--secure-port", action="store", type="int", dest="secure_port",
    #    help='Defaults to -p argument + 1 unless given --ssl-only')
    #parser.add_option("--ssl-only", action="store_true", dest="ssl_only", default=False)
    #parser.add_option("--plain-only", action="store_true", dest="plain_only", default=False)
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


    """ This Werkzeug server is used only for development and debugging """
    from werkzeug import run_simple
    import OpenSSL.SSL as ssl

    #ssl_context = ssl.Context(ssl.SSLv23_METHOD)
    #ssl_context.use_certificate_file(config.ssl_cert)
    #ssl_context.use_privatekey_file(config.ssl_key)
    #if config.ssl_ca:
    #    ssl_context.use_certificate_chain_file(config.ssl_ca)
    #ssl_context = 'adhoc'

    def run_hive(port, ssl=False):
        run_simple(
            '0.0.0.0'
          , port
          , application
          , use_reloader = True
          , use_debugger = config.debug_mode
          , use_evalex = config.debug_unsecure # from werkzeug.debug import DebuggedApplication
          , static_files = {
               '/lib' : joinpath(config.src_home, 'lib')
              ,'/images' : joinpath(config.src_home, 'libsrc/scss/images')
              ,'/file' : config.media_path
            }
          #, ssl_context = ssl_context if ssl else None
          #, processes = 0
          )

    print 'starting server...'
    run_hive(config.plain_port)

    #if options.secure:
    #    run_hive(config.ssl_port, True)
    #elif options.plain_only:
    #    run_hive(config.plain_port)
    #else:
    #    child = os.fork()
    #    if(child):
    #        run_hive(config.plain_port)
    #    else:
    #        run_hive(config.ssl_port, True)
