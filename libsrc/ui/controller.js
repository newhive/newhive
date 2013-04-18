define([
    'browser/jquery',
    'server/context',
    'sj!templates/card_master.html',
    'sj!templates/expr_card.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html',
], function($, context, card_template) {
    
    function clear() {
        // Clean up feed
        $('#feed').html('');
        // Clean up expressions displayed
        $('iframe.expr').remove();
    }
    
    function invert_nav(inverted) {
        if (inverted) {
            $('#nav').css('bottom','0');
        }
        else {
            $('#nav').css('bottom','');
        }
    }
    // TODO: Separate out browser/jquery code
    return { render: function(page_data_in){
        var page_data = page_data_in || context.page_data;
        if (page_data.expr_id) {
            clear();
            var $contentFrame = $('<iframe class="expr">');
            $contentFrame.css('width','100%');
            $contentFrame.css('height','100%');
            $contentFrame.attr('src', context.content_server_url + page_data.expr_id);
            $(document.body).append($contentFrame);
            invert_nav(true);
        }
        else {
            clear();
            $('#feed').html(card_template(context));
            invert_nav(false);
        }
    } };
});
