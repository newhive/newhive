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
        if (context.page_data.expr_id) {
            var $contentFrame = $('<iframe>');
            alert(context.page_data.expr_id);
            $contentFrame.attr('src', context.content_server_url + context.page_data.expr_id);
            $(document.body).append($contentFrame);
        }
        else {
            $('#feed').html(card_template(context));            
        }
    } };
});
