define([
    'browser/jquery',
    'sj!templates/card_master.html',
    'sj!templates/expr_card.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html',
], function($, card_template) {
    // TODO: Separate out browser/jquery code
    return { render: function(context){
        $('#feed .feed-content').html(card_template(context));
        $('.main-title').html(context.title[0]);
        $('.sub-title').html(context.title[1]);
    } };
});
