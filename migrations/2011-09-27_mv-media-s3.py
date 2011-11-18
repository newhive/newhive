from state import *

def file_extract(s):
    if not s: return None
    return map(File.fetch, re.findall('file/([0-9a-f]{24})', s))

def expr_mv_thumb(e):
    f = file_extract(e.get('thumb'))
    if f and len(f) and f[0]:
        url = s3_upload(f[0])
        e.update(updated=False, thumb=url)
    
def s3_upload(file_o):
    tmp_path = file_o.get('fs_path')
    if not tmp_path:
        print file_o.id + ' : no fs_path'
        return

    b = random.choice(s3_buckets)
    k = S3Key(b)
    k.name = file_o.id
    k.set_contents_from_filename(tmp_path,
        headers={ 'Content-Disposition' : 'inline; filename=' + file_o['name'], 'Content-Type' : file_o.get('mime') })
    url = k.generate_url(86400 * 3600)

    #file_o.update_cmd({ '$unset' : { 'fs_path' : True } })
    file_o.update(url=url, s3_bucket=b.name)
    print file_o.id + ' -> ' + b.name
    return url
    #os.remove(tmp_path)

def update_all_thumbs():
    for e in Expr.search(): expr_mv_thumb(Expr(e))
