import urllib, urllib2, json
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
    return int(response['result']['metadata']['globalCounts']['count'])
  except KeyError:
    raise Exception(response)

def facebook_count(url):
  # fql = https://api.facebook.com/method/fql.query?query=select%20like_count%20from%20link_stat%20where%20url=%22http://duffy.thenewhive.com/lumana
  fql = {
      "format": "json",
      "query": urllib.quote('select like_count from link_stat where url="' + url + '"', safe="="),
  }
  response_stream = urllib2.urlopen("https://api.facebook.com/method/fql.query?format=json&query=" + fql['query'])
  response = json.loads(response_stream.read())
  try:
    return int(response[0]['like_count'])
  except KeyError:
    raise Exception(response)

def twitter_count(url):
  host = 'http://search.twitter.com/search.json'
  data = {'q': url}
  response_stream = urllib2.urlopen(host + "?" + urllib.urlencode(data))
  response = json.loads(response_stream.read())
  try:
    return len(response['results'])
  except KeyError:
    raise Exception(response)
