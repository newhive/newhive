define([
    'browser/jquery',
    'sj!templates/card_master.html',
    'sj!templates/cards.html',
    'sj!templates/expr_card.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html',
], function($, card_template) {
    // TODO: Separate out browser/jquery code
    return { render: function(data){
        $('#feed').html(card_template(data));
    } };
});
