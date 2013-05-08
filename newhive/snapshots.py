import envoy
from newhive import config

class Snapshots(object):
    def __init__(self):
        # Check to see if xvfb is currently running
        sp = envoy.run('xdpyinfo -display :99')
        if sp.status_code != 0:
            envoy.run("Xvfb :99 -screen scrn 1024x768x24")
    def take_snapshot(self,expr_id,out_filename,dimensions=(1024,768)):
        url = config.content_domain + '/' + str(expr_id)
        envoy.run('webkit2png --feature=javascript --display=:99 --geometry=%s %s --output=%s' % (dimensions[0],dimensions[1],url))
        # envoy.run(' '.join(['webkit2png', '--feature=javascript', '--display=:99', '--geometry=390 235',
        #     '--output=temp_small.png', url]))