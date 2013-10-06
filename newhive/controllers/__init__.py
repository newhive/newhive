import controller, community, expr, file, user

class Controllers(object):
    """ Convenience class for instantiating all da controllers at once. """
    controllers = [
        controller.Controller,
        community.Community,
        expr.Expr,
        file.File,
        user.User,
    ]

    def __init__(self, server_env):
        for k in self.__class__.controllers:
            setattr(self, k.__name__.lower(), k(**server_env))

    @classmethod
    def register(this_class, that_class):
        this_class.controllers.append(that_class)
        return that_class

