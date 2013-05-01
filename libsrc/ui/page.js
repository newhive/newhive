define([
    'browser/jquery',
    'ui/nav',
    'server/context',
    'sj!templates/card_master.html',
    'sj!templates/profile_edit.html',
    'sj!templates/expr_card.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html'
], function($, nav, context, card_template, profile_edit_template) {
    var o = {}, expr_page = false, contentFrameURLBase = context.is_secure ?
        context.secure_content_server_url : context.content_server_url;
    const ANIM_DURATION = 700;

    o.init = function(method){
        nav.render(context.page_data);
        o.render(method, context);
        $(window).resize(layout);
        layout();
    };
    o.render = function(method, data){
        expr_page = method == 'expr';
        if(!expr_page) hide_exprs();
        return o[method](data.page_data);
    };

    // route.client_method definitions
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
    o.profile_edit = function(data){
         
    };
    o.profile_private = function(data){
        data.page_data.profile.sub_heading = 'Private';
        render_site(data);
        expr_column();
    };
    o.expr = function(page_data){
        display_expr(page_data.expr_id);
    };

    function display_expr(expr_id) {
        $('.expr-visible').removeClass('expr-visible');
        $('#exprs').show();

        var contentFrame = $('#expr_' + expr_id);
        if (contentFrame.length == 0) {
            // Create new content frame
            var contentFrameURL = contentFrameURLBase + expr_id;
            contentFrame = $('<iframe class="expr expr-visible">');
            contentFrame.attr('src', contentFrameURL);
            contentFrame.attr('id','expr_' + expr_id);
            $('#exprs').append(contentFrame);
        }
        else {
            contentFrame.addClass('expr-visible').removeClass('expr-hidden');
            contentFrame.get(0).contentWindow.
                postMessage({action: 'show'}, '*');
        }
        contentFrame.css('top',-contentFrame.height() + 'px');
        contentFrame.animate({
            top: "0"
        },{
            duration: ANIM_DURATION
        });
    }
    
    function hide_exprs() {
        var contentFrame = $('.expr-visible');

        if(contentFrame.length){
            contentFrame.animate({
                top: $(window).height() + 'px'
            },{
                duration: ANIM_DURATION,
                complete: function() {
                    contentFrame.addClass('expr-hidden');
                    contentFrame.removeClass('expr-visible');
                    contentFrame.get(0).contentWindow.
                        postMessage({action: 'hide'}, '*');
                    $('#exprs').hide();
                }
            });
        }
        else $('#exprs').hide();
    }

    function render_site(page_data){
        $('#site').empty().append(card_template(page_data));
    }

    function layout(){
        $('#site, #exprs').css('height', $(window).height() - 44);
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
