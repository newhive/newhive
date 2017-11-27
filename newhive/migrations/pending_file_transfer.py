import os
from md5 import md5

def write_lines(lines, fname):
    with open(fname, 'w') as f:
	f.writelines([l + '\n' for l in lines])

def file_paths(f):
    return [f.id] + f._resample_names + f._thumb_keys

def paths_from_files(fs):
    return [p for ps in [file_paths(f) for f in fs] for p in ps]

def file_meta(p):
    with open(p) as f:
        csum = md5(f.read()).hexdigest()
    return dict(size=os.stat(p).st_size, md5=csum)

def update_md5_and_size(db_file, cache_path):
    db_file.update(**file_meta(cache_path + db_file.id))
