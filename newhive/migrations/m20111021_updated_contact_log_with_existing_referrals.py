import state
from wsgi import *

def update_contact_log():
  cache = {}
  for contact in state.Contact.search():
    email = contact.get('email')
    if email:
      referral = cache.get(email)
      if not referral:
        referral = cache[email] = state.Referral.find(**{'to': email})

      if referral: 
        contact.update(referral_id=referral.id, updated=referral.get('updated'))  

