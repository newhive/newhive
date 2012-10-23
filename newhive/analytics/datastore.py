import pickle

def dataframe_to_record(dataframe):
    metadata = dict([(key,val) for key, val in dataframe.__dict__.iteritems() if not key.startswith('_')])
    return {'data': pickle.dumps(dataframe), 'metadata': metadata}

def record_to_dataframe(document):
    data = pickle.loads(document['data'])
    for key, val in document['metadata'].iteritems():
        setattr(data, key, val)
    return data
