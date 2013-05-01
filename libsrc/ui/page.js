define([
    'browser/jquery',
    'server/context',
    'sj!templates/card_master.html',
    'sj!templates/profile_edit.html',
    'sj!templates/expr_card.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html'
], function($, context, card_template, profile_edit_template) {
    var o = {}, expr_page = false;
    const ANIM_DURATION = 700;

    o.view_expr = function(page_data){
        show_feed();
        var $contentFrame = $('#expr_' + page_data.expr_id);
        $('#exprs .expr').hide();
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
        // invert_nav(true);
    };

    o.layout = function(){
        $('#site, #exprs').css('height', $(window).height() - 44);
    }

    function render_site(page_data){
        var $contentFrame = $('.expr-visible');
        show_feed();
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
        $('#site').empty().append(card_template(page_data));
        // replace_or_append(card_template(page_data), '#feed', '#site');
        // invert_nav(false);
    }

    function show_feed() {
        if(expr_page) {
            $('#site').hide();
            $('#exprs').show();
        }
        else {
            $('#site').show();
            $('#exprs').hide();
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
