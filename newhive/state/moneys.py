import stripe
from newhive.state import Entity, register
from newhive.mongo_helpers import mq
from newhive import config

stripe.api_key = config.stripe_secret

class MoneyTransaction(ImmutableDict):
    """ ABSTRACT BASE CLASS, DO NOT USE DIRECTLY
    Once a MoneyTransaction is constructed, the relevant money and data
    transfers within the NewHive DB have been completed. The resulting record
    object can no longer be modified, and should be stored for record keeping
    at all costs. """
    def __new__(klass, db, local_transfers, **doc):
        """ Transaction records have a list of local money transfers between
        user accounts, in addition to key=values describing the context of the
        Transaction.
        Args:
            local_transfers ([LocalTransfer]): local transfers
            **doc: describes context for transfers
        """
        doc.update(transfers=local_transfers, created=now())
        return super(ImmutableDict, klass).__new__(klass, doc)

DefaultMoneys = { 'credit': 0, 'sales': 0 }

class LocalTransfer(tuple):
    """ NOT TO BE USED DIRECTLY. Created by MoneyTransaction classes """
    Deposit = 1
    Debit = 2
    Transfer = 3
    # ... HiveDeposit = 5; HiveDebit = 6

    def __new__(klass, kind, amt, from_user=None, to_user=None):
        """ Move money from one user account to another.
        Args:
            from (User): take from from_user's moneys
            to (User): put into to_user's moneys
            amt (float): dolar ammount
            kind (int): must be 1, 2, or 3 - Deposit, Debit, Transfer
        """

        # make sure from and to users actually have accounts:
        from_user.set_if(mq().exists('moneys', False), DefaultMoneys)
        to_user.set_if(mq().exists('moneys', False), DefaultMoneys)

        # # begin transaction
        # if kind in [Debit, Transfer]:
        #     from_user.inc_if(mq().gte('moneys.credit', amt
        #     from_moneys = from_user.get('moneys', DefaultMoneys)
        #     from_id = from_user.id
        # to_moneys = to_user.get('moneys', DefaultMoneys)
        # # end transaction
        # return super(LocalTransfer, klass).__new__(klass, [
        #     from_user.id, account, to_user.id, account, amt
        # ])


class StripeDeposit(MoneyTransaction):
    def __new__(klass, user, stripe_user, amt):
        local_transfers = [] # [LocalTransfer(None,
        return super(StripeDeposit, klass).__new__(klass, local_transfers,
            action=1, user=user, stripe_user=stripe_user, amt=amt)
    # return Context(action=1, user=user, stripe_user_id=stripe_user_id

class SquareDebit(MoneyTransaction):
    pass
    # def __new__(klass, user, square_user, amt):
    #     return super(SquareDebit, klass).__new__(klass, action=2,
    #         user=user, square_user=square_user, amt=amt)

class Remix(MoneyTransaction):
    def __new__(klass, new_expr):
        parent_id = new_expr['remix_parent_id']
        new_id = new_expr.id
        remix_lineage = new_expr['remix_lineage']
        local_transfers = remix_value_distribution_v0(remix_lineage)
        return super(Remix, klass).__new__(klass, local_transfers, action=3,
            # parent_id=
            stripe_user=stripe_user, amt=amt)

    def remix_value_distribution(remix_lineage):
        transfers = []
        # TODO: calculate transfers
        return transfers

class HiveFuelDeposit(MoneyTransaction):
    pass
class HiveRevenueDebit(MoneyTransaction):
    pass


# fallible store for MoneyTransactions that needs to go in proper WORM DB
#@register
class MoneyTransactionRecord(Entity):
    cname = 'money_transaction'

    def create(self):
        pass
        # from_user = self.db.User.fetch(self['from_id'])
        # to_user = self.db.User.fetch(self['to_id'])
        # super(Transaction, self).create()

    # these things should probably never change or be deleted
    def update(self): pass
    def delete(self): pass

    def serialize(self, d):
        """ ensure we are a MoneyTransaction object """
        pass

    class Collection(Collection):
        def create(self, from_user, to_user, amt, kind, context):
            """ take MoneyTransaction object, stick it in """
            data = { 'from_id': from_user, 'to_id': to_user, 'amt': amt,
                'kind': kind }
            return super(Transaction.Collection, self).create(data)


