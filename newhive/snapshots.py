import envoy
import os
from sys import platform

from newhive import config, utils

class Snapshots(object):
    def __init__(self):
        if platform == 'linux' or platform == 'linux2':
            # Need xvfb running on linux to take snapshots. Check to see if it's currently running
            sp = envoy.run('xdpyinfo -display :99')
            if sp.status_code != 0:
                envoy.run("Xvfb :99 -screen scrn 1024x768x24")
    def take_snapshot(self,expr_id,out_filename,dimensions=(1024,768)):
        url = 'http://' + utils.url_host(on_main_domain=False,secure=False) + '/' + str(expr_id)
        if platform == 'linux' or platform == 'linux2':
            envoy.run('webkit2png --feature=javascript --display=:99 --geometry=%s %s --output=%s %s' % (dimensions[0],dimensions[1],out_filename,url))
        elif platform == 'darwin':
            # Mac support is super hacky and unreliable. Mostly just meant for local debugging.
            # Built to use this webkit2png: https://github.com/paulhammond/webkit2png/blob/master/webkit2png
            # Make sure delay is set to 1sec so javascript can position apps properly
            print 'webkit2png -C --clipwidth=%s --clipheight=%s --delay=1 --filename=out %s' % (dimensions[0],dimensions[1],url)
            envoy.run('webkit2png -C --clipwidth=%s --clipheight=%s --delay=1 --filename=out %s' % (dimensions[0],dimensions[1],url))
            # Because the Mac webkit2png insists on giving you foo-clipped.png when you asked for foo, let's just rename it here.
            os.rename('out-clipped.png',out_filename)