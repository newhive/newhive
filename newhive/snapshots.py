# requires cutycapt:
# sudo apt-get install cutycapt

import envoy
import os
from sys import platform

from newhive import config, utils

# TODO: move to routes manager?
# def expression_snapshot_URI(expr_id):
#     return "/api/expr/snapshots/" + expr_id

def snapshot_test():
    snapshots = Snapshots()
    snapshots.take_snapshot("50f60b796d902242fd02a754", "snap_out.png", (640,480))

class Snapshots(object):
    def __init__(self):
        pass
        # if platform == 'linux' or platform == 'linux2':
        #     # Need xvfb running on linux to take snapshots. Check to see if it's currently running
        #     sp = envoy.run('xdpyinfo -display :99')
        #     if sp.status_code != 0:
        #         self.ps = envoy.connect("Xvfb :99 -screen scrn 1024x768x24")
    def __del__(self):
        # if hasattr(self,'ps'): self.ps.kill()
        pass

    @staticmethod
    def remote_uri(expr_id):
        return 'expr_snapshot_' + str(expr_id)

    @staticmethod
    def s3_url(expr_id):
        return ( "https://%s.s3.amazonaws.com/%s" % 
            (config.s3_buckets['thumb'], Snapshots.remote_uri(expr_id)) )

    def take_snapshot(self,expr_id,out_filename,dimensions=(1024,768)):
        host = utils.url_host(on_main_domain=False,secure=False)
        # host = "localhost:3737"
        # url = 'http://' + host + ExpressionSnapshotURI(expr_id)
        url = 'http://' + host + '/' + expr_id + '?snapshot'
        # print url
        if platform == 'linux' or platform == 'linux2':
            cmd = ( 'cutycapt --min-width=%s --min-height=%s --url=%s --out=%s'
                % (dimensions[0],dimensions[1],url,out_filename) )
            # cmd = ('webkit2png --feature=javascript --display=:99 '+                
            #     '--geometry=%s %s --output=%s %s' % (dimensions[0],dimensions[1],out_filename,url))
            print cmd
            r = envoy.run(cmd)
            if r.status_code != 0:
                return False
            r = envoy.run('convert -crop %sx%s+0+0 %s %s' % (dimensions[0],dimensions[1],out_filename,out_filename))
            if r.status_code != 0:
                return False
            # 'webkit2png --feature=javascript --display=:99 '+
            #     '--geometry=%s %s --output=%s %s' % (dimensions[0],dimensions[1],out_filename,url))
            return True
        elif platform == 'darwin':
            # Mac support is super hacky and unreliable. Mostly just meant for local debugging.
            # Built to use this webkit2png: https://github.com/paulhammond/webkit2png/blob/master/webkit2png
            # Make sure delay is set to 1sec so javascript can position apps properly
            envoy.run('webkit2png -C --clipwidth=%s --clipheight=%s --delay=1 --filename=out %s' % (dimensions[0],dimensions[1],url))
            # Because the Mac webkit2png insists on giving you foo-clipped.png when you asked for foo, let's just rename it here.
            if not os.path.exists('out-clipped.png'):
                # If there's no PNG, webkit2png must have failed silently
                return False
            os.rename('out-clipped.png',out_filename)
            return True
    # def __init__(self):
        # if platform == 'linux' or platform == 'linux2':
        #     # Need xvfb running on linux to take snapshots. Check to see if it's currently running
        #     sp = envoy.run('xdpyinfo -display :99')
        #     if sp.status_code != 0:
        #         self.ps = envoy.connect("Xvfb :99 -screen scrn 1024x768x24")
    # def __del__(self):
        # if hasattr(self,'ps'): self.ps.kill()
