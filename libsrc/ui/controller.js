define([
    'browser/jquery',
    'server/context',
    'sj!templates/card_master.html',
    'sj!templates/expr_card.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html'
], function($, context, card_template) {
    var o = {};
    const ANIM_DURATION = context.ANIM_DURATION || 700;

    o.dispatch = function(method, data){
        var data = data.page_data || context.page_data;
        return o[method](data);
    };

    o.expr_detail = function(data){
        render_site(data);
        expr_column();
    };

    o.columns = function(data){
        render_site(data);
    };

    o.profile = function(data){
        render_site(data);
        expr_column();
    };

    o.profile_private = function(data){
        data.page_data.profile.sub_heading = 'Private';
        render_site(data);
        expr_column();
    };
    
    o.view_expr = function(page_data){
        show_feed(false);
        display_expr(page_data.expr_id);
        invert_nav(true);
    };
    
    function display_expr(expr_id) {
        var $contentFrame = $('#expr_' + expr_id);
        if ($contentFrame.length == 0) {
            // Create new content frame
            var contentFrameURL = (context.is_secure ? context.secure_content_server_url : content_server_url) + expr_id;
            $contentFrame = $('<iframe class="expr expr-visible">');
            $contentFrame.attr('src',  contentFrameURL);
            $contentFrame.attr('id','expr_' + expr_id);
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
    }
    
    function hide_exprs() {
        var $contentFrame = $('.expr-visible');
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
    }

    function render_site(page_data){
        show_feed(true);
        hide_exprs();
        $('#site').empty().append(card_template(page_data));
        // replace_or_append(card_template(page_data), '#feed', '#site');
        invert_nav(false);
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

    function expr_column(){
        // TODO: put actual rendering code here?

        // fix background spacing on line breaks
        $('.card .words').each(function(){
            var e = $(this);
            if(e.hasClass('spaced')) return;
            e.html(e.html().replace(/ |$/g, '&nbsp; '));
            e.addClass('spaced');
        });
    }

    // function replace_or_append(e, replace, append){
    //     var replace = $(replace);
    //     if(replace.length) replace.replaceWith(e);
    //     else $(append).append(e);
    // }

    return o;
});
