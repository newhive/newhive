import sys, logging
from os.path import join
from newhive import config

# Logging setup
# create logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# create file handler which logs info, debug messages
out = logging.StreamHandler(stream=sys.stdout)
out.setLevel(logging.DEBUG)
out.set_name('stdout')

# create console handler with a higher log level
ch = logging.StreamHandler()
ch.setLevel(logging.ERROR)
ch.set_name('stderr')

# create formatter and add it to the handlers
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s')
out.setFormatter(formatter)
ch.setFormatter(formatter)

# add the handlers to the logger
logger.addHandler(out)
logger.addHandler(ch)
