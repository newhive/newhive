import urllib2, json
def gplus_count(url):
  host = 'https://clients6.google.com/rpc?key=AIzaSyCKSbrvQasunBoV16zDH9R33D88CeLr9gQ'
  data = {
    "method":"pos.plusones.get", "id":"p", "jsonrpc":"2.0", "key":"p", "apiVersion":"v1",
    "params": {
      "nolog":True, "id":url, "source":"widget", "userId":"@viewer", "groupId":"@self"
    }
  }
  req = urllib2.Request(host, json.dumps(data), {'content-type': 'application/json'})
  response_stream = urllib2.urlopen(req)
  response = json.loads(response_stream.read())
  try:
    return response['result']['metadata']['globalCounts']['count']
  except KeyError:
    raise Exception(response)
