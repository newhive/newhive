import logging
from os.path import join
from newhive import config

# Logging setup
# create logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# create file handler which logs even debug messages
log_file = join(config.src_home, 'log', 'newhive.log')
fh = logging.FileHandler(log_file)
fh.setLevel(logging.DEBUG)

# create console handler with a higher log level
ch = logging.StreamHandler()
if config.debug_mode:
    ch.setLevel(logging.DEBUG)
else:
    ch.setLevel(logging.ERROR)

# create formatter and add it to the handlers
formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s')
fh.setFormatter(formatter)
ch.setFormatter(formatter)

# add the handlers to the logger
logger.addHandler(fh)
logger.addHandler(ch)
