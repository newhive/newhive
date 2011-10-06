import state, time

def active_users(reference_date=time.time()):
    col = state.db['expr']
    key={"owner": 1}
    condition = {}
    initial = {
        "total": {"total":0, "day":0, "week": 0, "month": 0}, 
        "private": {"total":0, "day":0, "week": 0, "month": 0}, 
        "public": {"total":0, "day":0, "week": 0, "month": 0}
        }
    reducejs = """
        function(obj,prev) { 
            var age = %(now)d - obj.created

            var authSlice = function(timerange) {
              if (obj.auth === 'password') { 
                prev.private[timerange]++; 
              } else { 
                prev.public[timerange]++; 
              }
              prev.total[timerange]++;
            }

            // Totals
            if (0 < age && age < 3600*24) { authSlice('day'); }
            if (0 < age && age < 3600*24*7) { authSlice('week'); }
            if (0 < age && age < 3600*24*7*4) { authSlice('month'); }
            authSlice('total');
            
        }
    """ % {'now': reference_date}

    res = col.group(key, condition, initial, reducejs)
    for item in res:
      user = state.User.fetch(item['owner'])
      if user:
        item['name'] = user['name']
        item['age'] = (time.time() - user['created']) / 3600 /24

    return res
