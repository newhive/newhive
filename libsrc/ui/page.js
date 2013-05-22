/* 
 * class page
   Top-level entry point for client view rendering.
   Delegates actual rendering to the templates.
 */
define([
    'browser/jquery',
    'ui/nav',
    'server/context',
    'browser/layout',
    'sj!templates/card_master.html',
    'sj!templates/profile_edit.html',
    'sj!templates/expr_card_large.html',
    'sj!templates/expr_card_feed.html',
    'sj!templates/expr_card_mini.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html',
    'sj!templates/profile_card.html',
    'sj!templates/icon_count.html',
], function($, nav, context, browser_layout, master_template, 
    profile_edit_template, card_template) {
    var o = {}, expr_page = false, contentFrameURLBase = context.is_secure ?
        context.secure_content_server_url : context.content_server_url,
        layout_method, grid_width, controller, 
        anim_direction; // 0 = up, +/-1 = right/left
    const ANIM_DURATION = 700;

    o.init = function(controller){
        o.anim_direction = 0;
        o.controller = controller;
        nav.render(o);
        $(window).resize(layout);
        window.addEventListener('message', o.handle_message, false);
        layout();
    };
    o.render = function(method, data){
        expr_page = (method == 'expr');
        if(!expr_page) hide_exprs();
        var page_data = data.page_data;
        page_data['layout_' + method] = true;
        // TODO: find a better place for these constants
        if (page_data['feed_layout'] == 'mini'){
            grid_width = 232 + 20; // padding = 10 + 10
        } else {
            grid_width = 410;
        }
        layout_method = page_data.layout = method;
        if(o[method]) o[method](page_data);
        else render_site(page_data);
        layout();
    };

    o.page_prev = function() { o.navigate_page(-1); }
    o.page_next = function() { o.navigate_page(1); }
    o.navigate_page = function (offset){
        o.anim_direction = offset / Math.abs(offset);
        var page_data = context.page_data;
        if (page_data.cards != undefined) {
            var len = page_data.cards.length
            var found = -1;
            // TODO: add the current card to context.
            for (var i = 0; i < len; ++i){
                if (page_data.cards[i].id == page_data.expr_id) {
                    found = i;
                    break;
                }
            }
            // TODO: do we need error handling?
            if (found >= 0) {
                // TODO: need to asynch fetch more expressions and concat to cards.
                found = (found + len + offset) % len;
                page_data.expr_id = page_data.cards[found].id;
                // o.render(layout_method, context);
                var page_state = {api:"/api/expr/" + page_data.expr_id, 
                    route_name:"view_expr",
                    page:"/" + page_data.cards[found].owner.name +
                        "/" + page_data.cards[found].name};
                o.controller.open_route(page_state);
            }
        }
    }
    // Handles messages from PostMessage (from other frames)
    o.handle_message = function(m){
        if ( m.data == "show_prev" || m.data == "show_next") {
            var div = (m.data == "show_prev" ? $("#page_prev") : $("#page_next"));
            div.show();
        }
        if ( m.data == "hide_prev" || m.data == "hide_next") {
            var div = (m.data == "hide_prev" ? $("#page_prev") : $("#page_next"));
            div.hide();
        }
    };

    // route.client_method definitions
    o.expr_detail = function(data){
        render_site(data);
        // expr_column(); // TODO: is this necessary?
    };

    // o.grid = function(data){
    //     add_cards = function(cards){
    //         out = '';
    //         for(var i = 0; i < cards.length;){
    //             out += '<tr>';
    //             for(var j = 0; j < 3; j++){
    //                 out += '<td>' + card_template(cards[i]) + '</td>';
    //                 i++;
    //             }
    //             out += '</tr>';
    //         }
    //         return out;
    //     };
    //     data.grid = true;
    //     render_site(data);
    // };

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

    // Animate the new visible expression, bring it to top of z-index.
    o.expr = function(page_data){
        // display_expr(page_data.expr_id);
        var expr_id = page_data.expr_id;
        var expr_curr = $('.expr-visible');
        expr_curr.removeClass('expr-visible');
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
        if (o.anim_direction == 0 || expr_curr.length != 1) {
            contentFrame.css({
                'display': "block",
                'left': 0,
                'top': -contentFrame.height() + 'px',
                'z-index': 1 }
            ).animate({
                top: "0"
            }, {
                duration: ANIM_DURATION,
                complete: hide_other_exprs });
        } else {
            // 
            contentFrame.css({
                'display': "block",
                'top': 0,
                'left': o.anim_direction * contentFrame.width(),
                'z-index': 1 }
            ).animate({
                left: "0"
            }, {
                duration: ANIM_DURATION,
                complete: hide_other_exprs,
                queue: false })
            expr_curr.animate({
                'left': -o.anim_direction * contentFrame.width(),
            }, {
                duration: ANIM_DURATION,
                complete: hide_other_exprs,
                queue: false })                    
        }
        $('#exprs .expr').not('.expr-visible').css({'z-index': 0 });
    }
    
    function hide_other_exprs() {
        $('#exprs .expr').not('.expr-visible').addClass('expr-hidden').css({display:"none"});
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
        } else {
            $('#exprs').hide();
            $("#page_next").css({'display':'none'});
            $("#page_prev").css({'display':'none'});
        }
    }

    function render_site(page_data){
        $('#site').empty().append(master_template(page_data));
    }

    function layout(){
        $('#site, #exprs').css('height', $(window).height() - 44);
        browser_layout.center($('#page_prev'), undefined, {'h': false});
        browser_layout.center($('#page_next'), undefined, {'h': false});
        if(layout_method == 'grid') $('#feed').css('width',
            Math.min(3, Math.floor($(window).width() / grid_width)) * grid_width);
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

    o.add_to_feed = function(data){
        $('#feed').append(show_cards(data));
    };

    // function replace_or_append(e, replace, append){
    //     var replace = $(replace);
    //     if(replace.length) replace.replaceWith(e);
    //     else $(append).append(e);
    // }

    return o;
});
