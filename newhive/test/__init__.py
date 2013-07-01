# diable stderr logging
import logging
logger = logging.getLogger('newhive')
logging.basicConfig(filename='newhive.log', filemode='w', level=logging.DEBUG)
logger.info("disabling stderr logging from here on out for tests, see newhive.log")
for handler in logger.handlers:
    if handler.name == 'stderr': logger.removeHandler(handler)

from newhive.test.controllers import SignupTest
#from newhive.test.controllers import *
#from newhive.test.mailers import *
#from newhive.test.misc import *
