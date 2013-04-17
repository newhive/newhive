define([
    'browser/jquery',
    'server/context',
    'sj!templates/card_master.html',
    'sj!templates/expr_card.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html',
], function($, context, card_template) {
    var o = {};
    // TODO: Separate out browser/jquery code

    function render(data){
        if (data.page_data.expr_id) {
            var $contentFrame = $('<iframe>');
            alert(data.page_data.expr_id);
            $contentFrame.attr('src', context.content_server_url + data.page_data.expr_id);
            $(document.body).append($contentFrame);
        }
        else {
            $('#feed').html(card_template(data));            
        }
    }

    o.dispatch = function(method, data){
        return o[method](data);
    }

    o.expr_detail = function(data){
        render(data);
    };

    o.columns = function(data){
        render(data);
    };

    o.profile = function(data){
        render(data);
    };

    o.profile_private = function(data){
        render(data);
    };

    return o;
});
