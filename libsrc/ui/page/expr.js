define([
    'browser/jquery',
    'server/context',
    'browser/layout',
    'ui/menu',
    'ui/dialog',
    'sj!templates/activity.html',
    'sj!templates/social_overlay.html',
    'sj!templates/edit_btn.html',
    'sj!templates/comment.html'
], function(
    $,
    context,
    browser_layout,
    menu,
    dialog,
    activity_template,
    social_overlay_template,
    edit_btn_template,
    comment_template
) {
    var o = {}, contentFrameURLBase = context.config.content_url,
        loading_frame_list = [], loaded_frame_list = [],
        overlay_columns = 0, wide_overlay = false,
        animation_timeout = undefined, last_found = -1;
    o.anim_duration = 400;

    o.init = function(controller){
        o.controller = controller;
        $("#page_prev").click(o.page_prev);
        $("#page_next").click(o.page_next);
        $("#social_plus").click(o.social_toggle);
        window.addEventListener('message', o.handle_message, false);
    };
    o.exit = function(){
        o.last_found = -1;
        hide_exprs();
        hide_panel();
        $('#site').show();
        $('.page_btn').hide();
    };

    hide_panel = function(){
        $("#signup_create").hide();
        $("#content_btns").hide();
        $("#signup_create .signup").addClass("hide");
        $("#signup_create .create").addClass("hide");
        $(".panel .social_btn").addClass("hide");
        $(".panel .edit_btn .icon").hide();
    }

    o.resize = function(){
        browser_layout.center($('#page_prev'), undefined, {'h': false});
        browser_layout.center($('#page_next'), undefined, {'h': false});

        var wide = ($(window).width() >= 1180) ? true : false;
        if (o.wide_overlay != wide) {
            o.wide_overlay = wide;
            $("#popup_content").css("max-width", (wide) ? 980+600-420 : 980);
            $("#popup_content .left_pane").width((wide) ? 600 : 420);
        }
        var columns = ($(window).width() >= 990) ? 2 : 1;
        if (o.overlay_columns != columns) {
            o.overlay_columns = columns;
            $("#popup_content > *").css('display', (columns == 1) ? 'block' : 'inline-block');
            $("#popup_content .right_pane").css('text-align', (columns == 1) ? 'left' : 'right');
        }
    };
    var resize_icon = function(el) {
        if (el.find(".counts").text().length > 0)
            el.width(Math.min(90, 90 + el.find(".counts").width()));
        else
            el.width(60);
     };

    o.get_expr = function(id){
        return $('#expr_' + id);
    };

    o.render = function(page_data){
        // TODO: should the HTML render on page load? Or delayed?
        o.expr = page_data.expr;

        $('title').text(o.expr.title);
        $("#nav").hide();
        $('#site').hide();
        $("#popup_content").remove();
        $("#dia_comments").remove();
        $('#social_overlay').append(
            social_overlay_template(context.page_data));
        $("#dia_comments").data("dialog").opts.open = function(){
            $("#dia_comments textarea").focus();
        }
        $('#popup_content .counts_icon').each(function(i, el) {
            resize_icon($(this));
        });
        o.resize();
        
        var embed_url = 'https://' + window.location.host + window.location.pathname + '?template=embed';
        $('#dia_embed .copy.embed_code').val("<iframe src='" + embed_url + 
            "' style='width: 100%; height: 100%' marginwidth='0' marginheight='0'" +
            " frameborder='0' vspace='0' hspace='0'></iframe>");

        // Set toggle state for love, broadcast, comment
        o.action_set_state($("#love_icon"), o.action_get_state("loves"));
        o.action_set_state($("#broadcast_icon"), o.action_get_state("broadcast"));
        o.action_set_state($("#comment_icon"), o.action_get_state("comment"));

        animate_expr();
        navigate_page(0); // To cache nearby expressions

        hide_panel();
        $("#content_btns").show();
        $(".social_btn").removeClass("hide");
        if (!context.user.logged_in) {
            $("#signup_create").show();
            $("#signup_create .signup").removeClass("hide");
            // $('#social_plus').hide();
        } else {
            $("#signup_create").show();
            $("#signup_create .create").removeClass("hide");
            if (context.user.id == o.expr.owner.id) {
                $('#content_btns .edit_btn').replaceWith(edit_btn_template(page_data));
                $('#content_btns .edit_btn .icon').show();
            }
        }
    };

    // Check to see if tags overflows its bounds.
    // If so, create "..." tag with associated menu.
    var fixup_tags_list = function () {
        tags = $(".tag_list a");
        if (tags.length) {
            top_y = tags.eq(0).position().top;
            client_height = $(".tag_list").height();
            var i = 1, shifting = 0;
            drawer = $("#tags_menu");
            for (; i < tags.length - 1; i++) {
                if (shifting) {
                    tags.eq(i).css("display","block").appendTo(drawer);
                } else if (tags.eq(i).position().top - top_y > client_height) {
                    shifting = i;
                    i -= 3; // take into account for loop ++ 
                    // and go to last item which didn't wrap
                    // and one more just for good measure.
                }
            }
            if (shifting) {
                $("#tag_more").removeClass("hide");
                // // create a cloned tag with text "..."
                // tag_more = tags.eq(0).find(".tag_label").clone();
                // // and append its label (without the <a>) back to the list.
                // tag_more.html("...").prop("id", "tag_more").appendTo($(".tag_list"));
                // // or include the <a> ?
                // // tag_more.appendTo($(".tag_list"));
                // menu(tag_more, drawer);
            }
        }
    };

    var find_card = function(expr_id){
        var found = -1;
        if (! page_data.cards)
            return found;
        var len = page_data.cards.length;
        for (var i = 0; i < len; ++i){
            if (page_data.cards[i].id == expr_id) {
                found = i;
                break;
            }
        }
        return found;
    };
    function cache_frames(expr_ids){
        if (expr_ids.length == 0)
            return false;
        expr_id = expr_ids[0];
        var contentFrame = o.get_expr(expr_id);
        if (contentFrame.length > 0) {
            cache_frames(expr_ids.slice(1));
            return contentFrame;
        }
        // Create new content frame
        var contentFrameURL = contentFrameURLBase + expr_id;
        contentFrame = $('<iframe class="expr">');
        contentFrame.attr('src', contentFrameURL);
        contentFrame.attr('id','expr_' + expr_id);
        // Cache the expr data on the card
        var page_data = context.page_data;
        if (page_data.cards != undefined) {
            found = find_card(expr_id);
            if (found >= 0) {
                var card = page_data.cards[found]
                if (card.json == undefined) {
                    o.controller.get('view_expr', {
                        id: expr_id,
                        owner_name: card.owner.name,
                        expr_name: card.name
                    }, function(json) {
                        card.json = json;
                    });
                }
            }
        }
        // Remember all the frames that are loading.
        loading_frame_list = loading_frame_list.concat(contentFrame.eq(0));
        contentFrame.load(function () {
            for (var i = 0, el; el = loading_frame_list[i]; i++) {
                if (el.prop("id") == contentFrame.prop("id")) {
                    loaded_frame_list.concat(loading_frame_list.splice(i, 1));
                    break;
                }
            }
            if (expr_ids.length > 1)
                cache_frames(expr_ids.slice(1))
            // alert("loaded frame.  Others remaining:" + loading_frame_list);
        });
        $('#exprs').append(contentFrame);
        // Remove all but 2 loading frames
        var max_loading_frames = 2;
        var removed_frames = loading_frame_list.splice(0, Math.max(0, loading_frame_list.length - max_loading_frames));
        for (var i = 0, el; el = removed_frames[i]; i++) {
            el.remove();
        }
        return contentFrame;
    };
    // Animate the new visible expression, bring it to top of z-index.
    function animate_expr (){
        page_data = context.page_data;
        // display_expr(page_data.expr_id);
        var expr_id = page_data.expr_id;
        var expr_curr = $('.expr-visible');
        expr_curr.removeClass('expr-visible');
        $('#exprs').show();
        $('.social_btn').show();

        var contentFrame = o.get_expr(expr_id);
        if (contentFrame.length == 0) {
            contentFrame = cache_frames([expr_id]);
        }
        else {
            contentFrame.get(0).contentWindow.
                postMessage({action: 'show'}, '*');
        }
        contentFrame.addClass('expr-visible').removeClass('expr-hidden');
        contentFrame.show();
        $('#exprs .expr').not('.expr-visible').css({'z-index': 0 });
        var found = find_card(expr_id);
        var anim_direction = 0;
        if (o.last_found >= 0 && found >= 0) {
            var dir = found - o.last_found;
            if (Math.abs(dir) > 5)
                dir *= -1;
            anim_direction = (dir > 0) ? 1 : -1;
        }
        o.last_found = found;
        if (anim_direction == 0 || expr_curr.length != 1 || o.animation_timeout != undefined) {
            contentFrame.css({
                'left': 0,
                'top': -contentFrame.height() + 'px',
                'z-index': 2 }
            ).animate({
                top: "0"
            }, {
                duration: 0, //anim_duration,
                complete: hide_other_exprs });
        } else {
            // 
            contentFrame.css({
                'top': 0,
                'left': anim_direction * contentFrame.width(),
                'z-index': 2 }
            ).animate({
                left: "0"
            }, {
                duration: o.anim_duration,
                complete: hide_other_exprs,
                queue: false })
            expr_curr.css('z-index', 1).animate({
                'left': -anim_direction * contentFrame.width(),
            }, {
                duration: o.anim_duration,
                complete: hide_other_exprs,
                queue: false })
        }
        if (o.animation_timeout != undefined) 
            clearTimeout(o.animation_timeout);
        o.animation_timeout = setTimeout(function() {
            o.animation_timeout = undefined;
        }, o.anim_duration);
        o.allow_animations = false;

        // postMessage only works after the page loads, so once page loads, we
        // can hide them and show on hover
        var btns = $('.page_btn').show();
        contentFrame.load(function(){
            btns.each(function(i, e){
                if(!$(e).hasClass('active')) $(e).hide()
            });
        });
    };

    var hide_other_exprs = function() {
        var to_hide = $('#exprs .expr').not('.expr-visible').filter(":visible");
        to_hide.each(function(i, el) {
            $(el).get(0).contentWindow.
                postMessage({action: 'hide'}, '*');
        });
        to_hide.addClass('expr-hidden').hide();
        fixup_tags_list();
    };

    var hide_exprs = function() {
        var contentFrame = $('.expr-visible');

        if(contentFrame.length){
            contentFrame.animate({
                top: $(window).height() + 'px'
            },{
                duration: 0, //anim_duration,
                complete: function() {
                    contentFrame.addClass('expr-hidden');
                    contentFrame.removeClass('expr-visible');
                    contentFrame.get(0).contentWindow.
                        postMessage({action: 'hide'}, '*');
                    hide_expr_complete();
                }
            });
        } else {
            hide_expr_complete();
        }
    };

    var hide_expr_complete = function() {
        $('#exprs').hide();
        $('.social.overlay').hide();
        // $('#nav').prependTo("body");
    };

    o.attach_handlers = function(){
        $("#social_close").unbind('click');
        $("#social_close").click(o.social_toggle);
        
        $(".social_btn").unbind('click');
        $(".social_btn").click(o.social_toggle);

        $('#comment_form').unbind('response').on('response', o.comment_response);

        $(".feed_item").each(function(i, el) {
            edit_button = $(el).find('button[name=edit]');
            delete_button = $(el).find('button[name=delete]');
            if (edit_button.length == 1) {
                edit_button.unbind('click');
                edit_button.click(function(event) {
                    o.edit_comment($(el));
                });
            }
            $(el).find('form').on('response', function(event, data) {
                o.edit_comment_response($(el), data); 
            });
        });

        $("#love_icon").unbind('click').click(function (event) {
            o.social_btn_click(event, $(this), "loves"); });
        $("#broadcast_icon").click(function (event) {
            o.social_btn_click(event, $(this), "broadcast"); });

        $('.page_btn').on('mouseenter', function(event){
            o.page_btn_animate($(this));
        });

        try {
            var d = dialog.create($("#dia_login_or_join"));
            $(".overlay .signup_btn").unbind('click').click(d.open);
            d = dialog.create($("#login_menu"));
            $(".overlay .login_btn").unbind('click').click(d.open);
        } catch(err) {;}
    };

    o.page_btn_animate = function (el) {
        var prop = "background-position-x";
        var dir = (el.prop("id") == "page_next") ? "" : "-";
        var orig_position = el.css(prop);
        if (el.data(prop))
            orig_position = el.data(prop);
        else
            el.data(prop, orig_position);

        el.stop().animate({
            'background-position-x': dir + "20px" }, {
            duration: 150,
            easing: 'swing',
            complete: function() {
                el.animate({
                    'background-position-x': orig_position }, {
                    duration: 150,
                    easing: 'swing'
                });
            }
        });
    };

    o.social_btn_click = function(e, el, btn) {
        if (!context.user.logged_in)
            return;

        var el_drawer = $("[data-handle=#" + el.prop("id") + "]");
        // var el_form = el.parent();
        var el_form = $("form." + ((btn == "loves") ? "love" : "republish"));
        var el_counts = el.find($(".counts"));

        // Toggle the state on the server
        // own_item is the toggled state, thus the opposite of current.
        var own_item = ! o.action_get_state(btn);
        el_form.find("input[name=state]").val(own_item);
        el_form.submit();

        // Now toggle it on the client without waiting for server response.
        items = get_items(btn);
        if (! own_item) {
            items = items.filter(function(el) {
                return el.initiator_name != context.user.name; } );
        } else {
            items = [o.fake_item(btn)].concat(items);
        }
        if (btn == "loves") 
            o.expr.loves = items;
        else
            o.expr.broadcast = items;
        top_context = {};
        top_context.activity = items;
        top_context.icon_only = true;
        el_drawer.empty().html(activity_template(top_context));
        el_drawer.data('menu').layout();

        var el_counts = el.find(".counts");
        var count = (el_counts.text().length == 0) ? 0 : parseInt(el_counts.text());
        count += ((own_item) ? 1 : -1);
        count = (count) ? ("" + count) : "";
        el_counts.text(count);
        resize_icon(el);
        o.action_set_state(el, own_item);
    };

    var get_items = function(btn){
        d = { "loves": o.expr.loves,
              "comment": o.expr.comments,
              "broadcast": o.expr.broadcast  };
        return d[btn];
    };
    o.action_get_state = function(btn){
        var items = get_items(btn),
            own_item = items.filter(function(el) {
                return el.initiator_name == context.user.name;
            });
        return (own_item.length > 0);
    };
    o.action_set_state = function(el, state) {
        if (state) {
            el.addClass("on");
            el.find(".icon").addClass("on");
        } else {
            el.removeClass("on");
            el.find(".icon").removeClass("on");
        }
    };

    o.fake_item = function(btn) {
        return {
            entity_class: "Expr",
            action:  (btn == "loves") ? "Love" : "Broadcast",
            class_name:  (btn == "loves") ? "Star" : "Broadcast",
            initiator_name:  context.user.name,
            initiator_thumb_small:  context.user.thumb_small
        };
    };

    o.social_toggle = function(){
        popup = $('#social_overlay');
        // TODO: animate
        if (popup.css('display') == 'none') {
            popup.show();
            fixup_tags_list();
        } else {
            popup.hide();
        }
    };

    o.edit_comment = function(feed_item){
        edit_button = feed_item.find('button[name=edit]');
        delete_button = feed_item.find('button[name=delete]');
        text_el = feed_item.find('div.text');
        text = text_el.html();
        if (text_el.is(":hidden")) {
            // Return to uneditable state
            text_el.show();
            feed_item.find('textarea').hide();
            edit_button.html("Edit");
            delete_button.html("Delete");
            feed_item.find('[name=deletion]').attr('value','delete');
        } else {
            // Settings -> editable state
            text_el.hide();
            feed_item.find('textarea').show().html(text);
            edit_button.html("Cancel");
            delete_button.html("Ok");
            feed_item.find('[name=deletion]').attr('value','edit');
        }
    };
    o.edit_comment_response = function(feed_item, json){
        // rerender activity feed (only in social overlay and nav menu)
        // with new data received from server
        if (json.comments != undefined) {
            // TODO: how can we remember variable state in stringjay
            // and not have to duplicate it in js?
            context.page_data.expr.activity = json.activity;
            context.page_data.expr.comments = json.comments;
            var comment_box = $('#dia_comments .activity').empty();
            json.comments.map(function(item){
                comment_box.append(comment_template(item))});

            // update count and highlight state
            $(".counts_icon.comment").find(".counts").text(json.comments.length);
            resize_icon($("#social_overlay .counts_icon.comment"));
            o.action_set_state($("#comment_icon"), o.action_get_state("comment"));
        }
        // TODO-cleanup: merge somehow with existing code to update activity menu
        if (json.user != undefined) {
            top_context = {};
            top_context.activity = json.user.activity;
            context.user.activity = json.user.activity;
            $('#nav .activity').empty().html(activity_template(top_context));
        }
        o.attach_handlers();
    };
    o.comment_response = function (e, json){
        $('#comment_form textarea').val('');
        o.edit_comment_response([], json);
    };

    o.page_prev = function() { navigate_page(-1); };
    o.page_next = function() { navigate_page(1); };
    var navigate_page = function (offset){
        var page_data = context.page_data;
        if (page_data.cards != undefined) {
            var len = page_data.cards.length
            var found = find_card(page_data.expr_id);
            // TODO: do we need error handling?
            if (found >= 0) {
                // TODO: need to asynch fetch more expressions and concat to cards.
                found = (found + len + offset) % len;
                // Cache upcoming expressions
                cache_offsets = [1, -1, 2];
                if (offset < 0)
                    cache_offsets = cache_offsets.map(function(o) { return -o; });
                expr_ids = [];
                for (var i = 0, off; off = cache_offsets[i]; ++i) {
                   var found_next = (found + len + off) % len;
                   expr_ids = expr_ids.concat(page_data.cards[found_next].id);
                }
                cache_frames(expr_ids);
                if (offset) {
                    var card = page_data.cards[found]
                    page_data.expr_id = card.id;
                    var data = {
                        id: page_data.expr_id,
                        owner_name: page_data.cards[found].owner.name,
                        expr_name: page_data.cards[found].name
                    };
                    if (card.json) {
                        $.extend(page_data, card.json);
                        o.render(page_data);
                        o.attach_handlers();
                        o.controller.fake_open('view_expr', data);
                    } else {
                        o.controller.open('view_expr', data);
                    }
                }
            }
        }
    };
    // Handles messages from PostMessage (from other frames)
    o.handle_message = function(m){
        if (m.data == "expr_click") {
            popup = $('#social_overlay');
            if (popup.css('display') != 'none')
                o.social_toggle();
            return
        }
        o.page_btn_handle(msg);
    };

    o.page_btn_handle = function(msg){
        // don't render the page buttons if there is nothing to page through!
        if (context.page_data.cards == undefined
            || context.page_data.cards.length == 1) {
            $(".page_btn").hide();
            return;
        }
        if ( msg == "show_prev" || msg == "show_next") {
            var div = $(msg == "show_prev" ? "#page_prev" : "#page_next");
            div.show().addClass('active');
        }
        if ( msg == "hide_prev" || msg == "hide_next") {
            var div = $(msg == "hide_prev" ? "#page_prev" : "#page_next");
            div.hide().removeClass('active');
        }
    };

    return o;
});
