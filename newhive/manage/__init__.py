try:
    from newhive.config import aws as config
except ImportError:
    "Could not import aws.py"
    from newhive import config

if hasattr(config, 'aws_id') and hasattr(config, 'aws_secret'):
    aws_credentials = (config.aws_id, config.aws_secret)
else:
    aws_credentials = ()
