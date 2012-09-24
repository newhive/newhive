# diable stderr logging
import logging
logger = logging.getLogger('newhive')
logger.info("diabling stderr logging from here on out for tests, see newhive.log")
for handler in logger.handlers:
    if handler.name == 'stderr': logger.removeHandler(handler)
