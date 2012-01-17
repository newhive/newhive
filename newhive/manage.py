#!/usr/bin/env python
from wsgi import assets_env
print(assets_env.debug)
from webassets.ext.werkzeug import make_assets_action
action_assets = make_assets_action(assets_env)

from werkzeug import script
script.run()
