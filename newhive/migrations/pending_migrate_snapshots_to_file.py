import re
from newhive import state
db = state.Database()
from newhive.utils import now, time_u

import urllib
import os

def migrate():
	return apply_all(migrate_snapshot, db.Expr.search({}))

def apply_all(func, list):
	errors = []
	for e in list:
		if not func(e):
			errors.append(e)
	return errors

def migrate_snapshot(expr):
	if expr.get('snapshot'):
		return True
	dimensions = {"big": (715, 430), "small": (390, 235), 'tiny': (70, 42)}
	new_files = {}
	old_time = expr.get('snapshot_time', False)
	for size, dim in dimensions.items():
		url = expr.snapshot_name(size)
		if not url: 
			print "no snapshot found, " + size
			return False

		try: response = urllib.urlopen(url)
		except:
		    print 'urlopen fail for ' + expr.id + ': ' + json.dumps(url)
		    return False
		if response.getcode() != 200:
		    print 'http fail ' + str(response.getcode()) + ': ' + url
		    return False
		new_files[size] = os.tmpfile()
		new_files[size].write(response.read())
	
	file_data = {'owner': expr.owner.id,
	    'tmp_file': new_files["big"],
	    'name': 'snapshot', 'mime': 'image/png'}
	file_record = db.File.create(file_data)
	file_record['dimensions'] = ( 
		dimensions["big"][0], dimensions["big"][1])
	for size, tmp_file in new_files.items():
	    name = expr.snapshot_name_base(size, str(old_time))
	    db.s3.delete_file('thumb', name)
	    if size != "big":
	        file_record.set_thumb(
	            dimensions[size][0], dimensions[size][1], file=tmp_file,
	            mime='image/png', autogen=False)
	file_record.save()
	expr.update(snapshot=file_record.id, updated=False)
