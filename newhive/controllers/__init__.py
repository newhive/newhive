from newhive.controllers import base, community, expr, file, search, user

class Controllers(object):
    """ Convenience class for instantiating all da controllers at once. """
    controllers = [base.Controller, community.Community, expr.Expr, file.File,
        search.Search, user.User]

    def __init__(self, server_env):
        for k in self.__class__.controllers:
            setattr(self, k.__name__.lower(), k(**server_env))

    @classmethod
    def register(this_class, that_class):
        this_class.controllers.append(that_class)
        return that_class

