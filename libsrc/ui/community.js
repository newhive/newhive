define([
    'browser/jquery',
    'server/context',
    'sj!templates/card_master.html',
    'sj!templates/expr_card.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html',
], function($, context, card_template) {
    // TODO: Separate out browser/jquery code
    return { render: function(){
        var x = $('#feed .feed-content');
        console.log(context);
        $('#feed .feed-content').html(card_template(context));
    } };
});
