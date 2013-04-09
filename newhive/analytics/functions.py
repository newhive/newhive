"""
    newhive.analytics.functions
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~

    place to put functions that can be used within or without
    analtyics.queries.Query

    could also be thought of/renamed newhive.analytics.utils

"""

import pickle
import datetime, pytz
import pandas
import numpy
from outsrc import gviz
from newhive.utils import un_camelcase

def user_expression_summary(user, p=False):
    data = [(e['name'], e['views']) for e in user.get_expressions('public')]
    data = data or [('', 0)]
    data = pandas.DataFrame(data, columns=['name', 'views'])
    if p:
        print data.describe()
        print data
    return data

def smooth(x, window_len=7, window='hanning'):
    """smooth the data using a window with requested size.

    This method is based on the convolution of a scaled window with the signal.
    The signal is prepared by introducing reflected copies of the signal
    (with the window size) in both ends so that transient parts are minimized
    in the begining and end part of the output signal.

    input:
        x: the input signal
        window_len: the dimension of the smoothing window; should be an odd integer
        window: the type of window from 'flat', 'hanning', 'hamming', 'bartlett', 'blackman'
            flat window will produce a moving average smoothing.

    output:
        the smoothed signal

    example:

    t=linspace(-2,2,0.1)
    x=sin(t)+randn(len(t))*0.1
    y=smooth(x)

    see also:

    numpy.hanning, numpy.hamming, numpy.bartlett, numpy.blackman, numpy.convolve
    scipy.signal.lfilter

    TODO: the window parameter could be the window itself if an array instead of a string
    NOTE: length(output) != length(input), to correct this: return y[(window_len/2-1):-(window_len/2)] instead of just y.
    CREDIT:
        http://stackoverflow.com/questions/5515720/python-smooth-time-series-data
        http://www.scipy.org/Cookbook/SignalSmooth
    """

    if x.ndim != 1:
        raise ValueError, "smooth only accepts 1 dimension arrays."

    if x.size < window_len:
        raise ValueError, "Input vector needs to be bigger than window size."

    if window_len<3:
        return x


    if not window in ['flat', 'hanning', 'hamming', 'bartlett', 'blackman']:
        raise ValueError, "Window is on of 'flat', 'hanning', 'hamming', 'bartlett', 'blackman'"


    s=numpy.r_[2*x[0]-x[window_len-1::-1],x,2*x[-1]-x[-1:-window_len:-1]]
    if window == 'flat': #moving average
            w=numpy.ones(window_len,'d')
    else:
            w=eval('numpy.'+window+'(window_len)')
    y=numpy.convolve(w/w.sum(),s,mode='same')
    return y[window_len:-window_len+1]

def json_types_from_record(rec):
    def mapping(typ, i):
        # to support: ["string", "number", "boolean", "date", "datetime", "timeofday"]
        if typ == numpy.object_:
            typ = type(rec[0][i])
        if issubclass(typ, (int, float)):
            return 'number'
        elif issubclass(typ, basestring):
            return 'string'
        elif issubclass(typ, datetime.date):
            return 'date'
        elif issubclass(typ, (datetime.datetime, numpy.datetime64)):
            return 'datetime'
        elif issubclass(typ, bool):
            return 'boolean'
        else:
            raise ValueError("type {} not supported yet".format(typ))
    types = [mapping(rec.dtype.fields[name][0].type, i) for i, name in enumerate(rec.dtype.names)]
    return zip(rec.dtype.names, types)

def dataframe_to_gviz_json(dataframe):
    rec = dataframe.to_records()
    dt = gviz.DataTable(json_types_from_record(rec), rec.tolist()).ToJSon()
    return dt

def dtnow():
    return datetime.datetime.now(pytz.utc)

def dataframe_to_record(dataframe):
    metadata = dict([(key,val) for key, val in dataframe.__dict__.iteritems() if not key.startswith('_')])
    return {'data': pickle.dumps(dataframe), 'metadata': metadata}

def record_to_dataframe(document):
    data = pickle.loads(document['data'])
    for key, val in document['metadata'].iteritems():
        setattr(data, key, val)
    return data

def ga_column_name_to_title(s):
    return un_camelcase(s[3:]).title()
