import state, os

#for e in state.db.expr.find(): state.db.expr.update({ '_id' : e['_id'] }, { '$set' : {'owner_name' : state.User.fetch(e['owner'])['name'] } })   

import PIL.Image as Img
def rsz(path, mime):
    print path
    opts = {}
    if mime == 'image/jpeg': opts.update(quality = 70, format = 'JPEG')
    elif mime == 'image/png': opts.update(optimize = True, format = 'PNG')
    elif mime == 'image/gif': opts.update(format = 'GIF')
    else: return
    try: imo = Img.open(path)
    except:
        print 'failed: ' + path
        return False
    if imo.size[0] > 1600 or imo.size[1] > 1000:
        print 'resizing: ' + path
        ratio = float(imo.size[0]) / imo.size[1]
        new_size = (1600, int(1600 / ratio)) if ratio > 1.6 else (int(1000 * ratio), 1000)
        imo = imo.resize(new_size, resample=Img.ANTIALIAS)
        imo = imo.convert(mode='RGB')
        os.rename(path, path + '.orig')
        try: imo.save(path, **opts)
        except:
            print 'save failed: ' + path
            os.rename(path + '.orig', path)
