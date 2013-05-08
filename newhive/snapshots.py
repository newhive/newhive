import envoy
import os
from sys import platform

from newhive import config

class Snapshots(object):
    def __init__(self):
        # Check to see if xvfb is currently running
        sp = envoy.run('xdpyinfo -display :99')
        if sp.status_code != 0:
            envoy.run("Xvfb :99 -screen scrn 1024x768x24")
    def take_snapshot(self,expr_id,out_filename,dimensions=(1024,768)):
        url = config.content_domain + '/' + str(expr_id)
        if platform == 'linux' or platform == 'linux2':
            envoy.run('webkit2png --feature=javascript --display=:99 --geometry=%s %s --output=%s' % (dimensions[0],dimensions[1],url))
        elif platform == 'darwin':
            # Mac support is super hacky, and mostly for local debugging.
            envoy.run('webkit2png -C --clipwidth=%s --clipheight=%s --filename=out %s' % (dimensions[0],dimensions[1],url))
            # Because the Mac webkit2png insists on giving you foo-clipped.png when you asked for foo, let's just rename it here.
            os.rename('out-clipped.png',out_filename)


        # envoy.run(' '.join(['webkit2png', '--feature=javascript', '--display=:99', '--geometry=390 235',
        #     '--output=temp_small.png', url]))