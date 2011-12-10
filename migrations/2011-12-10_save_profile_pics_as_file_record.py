def save_profile_thumb(user):
  if not user.get('profile_thumb'): print "no thumbnail"; return

  thumb_url = user.get('profile_thumb')

  if not re.match('https?://..-thenewhive.s3.amazonaws.com', thumb_url):
      print "thumbnail url " + thumb_url + " does not seem to be an S3 file"
  else:
      file_id = user.get('thumb_file_id')
      if not file_id: file_id = thumb_url.split('/')[-1]
      file = File.fetch(file_id)
      if not file: print "file id " + file_id + " not found"; return
      print 'checking thumbnails for file ' + file_id
      try:
          if (not file.get('thumbs')) or (not file['thumbs'].get('190x190')):
              thumb190 = file.set_thumb(190,190)['file']
              file.set_thumb(70,70, file=thumb190)
          if (not file.get('thumbs')) or (not file['thumbs'].get('124x96')):
              file.set_thumb(124,96)
          file.save()
      except: print "something went wrong with thumbnail generation"
      user['thumb_file_id'] = file_id
      user.save()


