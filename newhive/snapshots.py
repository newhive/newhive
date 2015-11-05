# requires cutycapt:
# sudo apt-get install cutycapt
# see http://daveelkins.com/2009/04/10/setting-up-headless-xserver-and-cutycapt-on-ubuntu/
# TODO: Snapshot batching. namely, CutyCapt should be able to take a list of 

import os, urllib
from os.path import join
from sys import platform
from subprocess import call, Popen, PIPE

from newhive import config, utils
from PIL import Image
import PIL.Image as Img
from PIL import ImageOps

# TODO: move to routes manager?
# def expression_snapshot_URI(expr_id):
#     return "/api/expr/snapshots/" + expr_id

def snapshot_test():
    snapshots = Snapshots()
    snapshots.take_snapshot("50f737d36d902248910accfe", "snap_out.jpg", (640,480))

class Snapshots(object):
    # TODO-cleanup (everything about this)
    def take_snapshot(self,expr_id,out_filename,dimensions=(1024,768),
        full_page=False, password=''):
        host = utils.url_host(on_main_domain=False,secure=False)
        # host = "localhost:3737"
        # url = 'http://' + host + ExpressionSnapshotURI(expr_id)
        if isinstance(password, basestring) and len(password) > 0:
            host = utils.url_host(on_main_domain=False,secure=True)
            url = ( 'http://' + host + '/' + expr_id + '?snapshot&' +
                urllib.urlencode({'pw': password}) )
        else:
            url = 'http://' + host + '/' + expr_id + '?snapshot'
        # print url
        if platform == 'linux' or platform == 'linux2':
            ratio = 1.0 * dimensions[0] / dimensions[1];
            snap_dimensions = list(dimensions)
            if (snap_dimensions[0] < 1000):
                snap_dimensions = [ 1000, 1000./dimensions[0]*dimensions[1] ]
            # cmd = ( ( join(config.src_home, 'bin/CutyCapt/CutyCapt') + 
            #     ' --delay=10000 --max-wait=90000 --min-width=%s --min-height=%s' +
            #     ' --plugins=on --url="%s" --out=%s' )
            #     % (snap_dimensions[0],snap_dimensions[1],url,out_filename) )
            cmd = ( ( join(config.src_home, 'bin/awesomium_sampler') + 
                ' "%s" %s %s %s' )
                % (url,out_filename, snap_dimensions[0],snap_dimensions[1]) )
            # cmd = ('webkit2png --feature=javascript --display=:99 '+                
            #     '--geometry=%s %s --output=%s %s' % (dimensions[0],dimensions[1],out_filename,url))
            # os.environ['DISPLAY'] =':99'
            r = 0
            with open(os.devnull, "w") as fnull:
                # BUGBUG
                if True:
                    cmd = 'xvfb-run --auto-servernum --server-args="-screen 0, 1024x768x24" ' + cmd
                print cmd
                r = call(cmd, shell=True) #, stderr=fnull, stdout=fnull)
                # r = envoy.run(cmd, {"DISPLAY":":19"})
                if r != 0:
                    print "FAILED: " + cmd
                    return False
                if not full_page:
                    cmd = ('convert -resize %s -background transparent -extent %sx%s %s %s' % (
                        dimensions[0],dimensions[0],dimensions[1], out_filename, out_filename))
                    print cmd
                    r = call(cmd.split(' '))
            return r == 0

    def __del__(self):
        # print "snapshot del!!!"
        if hasattr(self,'ps'): self.ps.kill()
