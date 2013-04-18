from newhive.controllers.base import Controller

# maybe make this inherit from ModelController if based off a MongoDB
# collection, otherwise if implemented with Elastic Search or similar, it
# should stay like this.
class Search(Controller):
    pass
