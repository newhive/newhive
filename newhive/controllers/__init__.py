from controller import * # for tab completion
import controller, community, expr, file, user, cron, admin

class Controllers(dict):
    """ Convenience class for instantiating all da controllers at once. """
    controllers = [
        controller.Controller,
        community.Community,
        cron.Cron,
        expr.Expr,
        file.File,
        user.User,
        admin.Admin,
    ]

    def __init__(self, server_env):
        for k in self.controllers:
            self[k.__name__.lower()] = k(**server_env)

    @classmethod
    def register(this_class, that_class):
        this_class.controllers.append(that_class)
        return that_class

