import re
from newhive import state, config
db= state.Database(config)

def update(e):
    def match_id(s):
        if not isinstance(s, (str, unicode)): return []
        ms = map(lambda m: m[0].strip('_'), re.findall(r'\b([0-9a-f]{24})(\b|_)', s))
        return filter(lambda i: db.File.fetch(i) != None, ms)

    ids = ( match_id(e.get('background', {}).get('url')) +
            match_id(e.get('thumb')) +
            ( [e['thumb_file_id']] if e.has_key('thumb_file_id') else [] ) )

    for a in e.get('apps', []):
        id = match_id( a.get('content') )
        if( len( id ) ): a['file_id'] = id
        ids.extend( list( set( id ) ) )

    ids = list( set( ids ) )

    e.save()
