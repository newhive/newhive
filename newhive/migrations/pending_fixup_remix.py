import re
from newhive import state
db = state.Database()
from newhive.utils import now, time_u, Apply

import urllib
import os

def migrate():
    return Apply.apply_all(fixup_remix, db.User.search({}))

def fixup_remix(user):
    tagged = user.tagged;
    for tag in tagged.keys():
        if tag.startswith('remix/'):
            new_tag = 're:' + tag[6:]
            new_list = tagged.get(new_tag, []) + tagged[tag]
            tagged[new_tag] = new_list
            del tagged[tag]
            # print new_list
    user.update(tagged=tagged)

    return True
