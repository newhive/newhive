define([
    'browser/jquery',
    'server/context',
    'sj!templates/card_master.html',
    'sj!templates/user_header.html',
    'sj!templates/expr_card.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html'
], function($, context, card_template, user_header_template) {
    var o = {};
    const ANIM_DURATION = context.ANIM_DURATION || 700;

    function render(data_in){
        var page_data = data_in.page_data || context.page_data;
        if (page_data.expr_id) {
            show_feed(false);
            var $contentFrame = $('#expr_' + page_data.expr_id);
            if ($contentFrame.length == 0) {
                // Create new content frame
                $contentFrame = $('<iframe class="expr expr-visible">');
                $contentFrame.attr('src', context.content_server_url + page_data.expr_id);
                $contentFrame.attr('id','expr_' + page_data.expr_id);
                $('#exprs').append($contentFrame);
            }
            else {
                $contentFrame.addClass('expr-visible');
                $contentFrame.removeClass('expr-hidden');
            }
            $contentFrame.css('top',-$contentFrame.height() + 'px');
            $contentFrame.animate({
                top: "0"
            },{
                duration: ANIM_DURATION
            });
            invert_nav(true);
        }
        else {
            var $contentFrame = $('.expr-visible');
            show_feed(true);
            if ($contentFrame.length == 1) {
                $contentFrame.animate({
                    top: -$('.expr-visible').height()
                },{
                    duration: ANIM_DURATION,
                    complete: function() {
                        $contentFrame.addClass('expr-hidden');
                        $contentFrame.removeClass('expr-visible');
                    }
                });
            } 
            $('#site').append(card_template(page_data));
            invert_nav(false);
        }
    }

    function show_feed(_show) {
        if (_show) {
            $('#site').css('display','block');
        }
        else {
            $('#site').css('display','none');            
        }
    }
    
    function invert_nav(inverted) {
        if (inverted) {
            $('#nav').animate({
                'top': ($(document.body).height() - $('#nav').height())
            }, {
                duration: ANIM_DURATION
            });
        }
        else {
            $('#nav').animate({
                'top': '0'
            }, {
                duration: ANIM_DURATION
            });
        }
    }

    o.dispatch = function(method, data){
        return o[method](data);
    };

    o.expr_detail = function(data){
        render(data);
        expr_column();
    };

    o.columns = function(data){
        render(data);
    };

    o.profile = function(data){
        $('#site').append(user_header_template(data.page_data.profile));
        render(data);
        expr_column();
    };

    o.profile_private = function(data){
        data.profile.private = true;
        $('#site').append(user_header_template(data.page_data.profile));
        render(data);
    };

    o.view_expr = function(data){
        render(data);
    };

    function expr_column(){
        // fix background spacing on line breaks
        $('.card .words').each(function(){
            var e = $(this);
            if(e.hasClass('spaced')) return;
            e.html(e.html().replace(/ |$/g, '&nbsp; '));
            e.addClass('spaced');
        });
    }

    return o;
});
