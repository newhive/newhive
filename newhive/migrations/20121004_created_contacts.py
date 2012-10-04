from newhive import state, config

def main(db):
    for referral in db.Referral.search({'user_created': {'$exists': True}}):
        contact = db.Contact.find({'referral_id': referral.id})
        if contact: contact.update(user_created = referral['user_created'])
