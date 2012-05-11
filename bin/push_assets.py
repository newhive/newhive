from os.path import dirname, join, abspath
import sys, os
parent_path = abspath(join(dirname(__file__), '..'))
sys.path.append(parent_path)
import boto
fromp newhive import state, config


db = state.Database(config)


#    def store_aws(self, file, id, name):
#        file.seek(0)
#        b = self.db.s3_con.get_bucket(self.get('s3_bucket', random.choice(self.db.s3_buckets).name))
#        k = S3Key(b)
#        k.name = id
#        k.set_contents_from_file(file,
#            headers={ 'Content-Disposition' : 'inline; filename=' + name, 'Content-Type' : self['mime'] })
#        k.make_public()
#        return k.generate_url(86400 * 3600, query_auth=False)
#
