define([
    'browser/jquery',
    'server/context',
    'browser/layout',
    'ui/util',
    'ui/menu',
    'ui/dialog',

    'sj!templates/activity.html',
    'sj!templates/social_overlay.html',
    'sj!templates/edit_btn.html',
    'sj!templates/expr_actions.html',
    'sj!templates/comment.html'
], function(
    $,
    context,
    browser_layout,
    util,
    menu,
    dialog,

    activity_template,
    social_overlay_template,
    edit_btn_template,
    expr_actions_template,
    comment_template
) {
    var o = {}, 
        loading_frame_list = [], loaded_frame_list = [],
        overlay_columns = 0, wide_overlay = false,
        animation_timeout = undefined, last_found = -1;
    o.cache_offsets = [1, -1, 2];
    o.anim_duration = (util.mobile()) ? 400 : 400;

    // pagination functions here
    o.set_page = function(page){
        ui_page = page;
    }
    var more_cards = true, ui_page, win = $(window);
    var on_scroll_add_page = function(){
        if (more_cards) 
            o.controller.next_cards(render_new_cards);
    };
    var render_new_cards = function(data){
        // TODO-cleanup-HACK: There should be a unified flow for merging
        // the new data
        ui_page.render_new_cards(data);
        if(data.cards.length < 20)
            more_cards = false;
    };

    o.init = function(controller){
        o.controller = controller;
        // context.is_secure not set until after module instantiation
        o.content_url_base = (context.is_secure ?
                context.config.secure_content_url : context.config.content_url);
        $("#page_prev").click(o.page_prev);
        $("#page_next").click(o.page_next);
        $("#social_plus").click(o.social_toggle);
        window.addEventListener('message', o.handle_message, false);
    };

    o.hide_panel = function(){
        $("#signup_create").hidehide();
        $("#content_btns").hidehide();
        $("#signup_create .signup").addClass("hide");
        $("#signup_create .create").addClass("hide");
        $(".panel .social_btn").addClass("hide");
        $(".panel .edit_ui").hidehide();
    }

    o.resize = function(){
        browser_layout.center($('#page_prev'), undefined, {'h': false});
        browser_layout.center($('#page_next'), undefined, {'h': false});

        var wide = ($(window).width() >= 1180) ? true : false;
        var columns = ($(window).width() >= 980) ? 2 : 1;
        if (o.overlay_columns != columns) {
            o.overlay_columns = columns;
            $("#popup_content .left_pane").width((columns == 1) ? 508 : 430);
            $("#popup_content > *").css('display', (columns == 1) ? 'block' : 'inline-block');
            $("#popup_content .right_pane").css('text-align', (columns == 1) ? 'left' : 'right').
                css("max-width", (columns == 1) ? '522px' : '470px');
            if (columns == 1)
                $("#popup_content .empty").showshow();
            else
                $("#popup_content .empty").hidehide();
        }
        if (o.wide_overlay != wide) {
            o.wide_overlay = wide;
            $("#popup_content").css("max-width", (wide) ? 980+600-430 : 980);
            $("#popup_content .left_pane").width((wide) ? 600 : 430);
        }
    };
    var resize_icon = function(el) {
        var count = el.find('.counts')
        if(!count.length) return
        if (count.text().length > 0)
            el.width(Math.min(90, 90 + count.width()));
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
        $('#site').hidehide();
        $("#popup_content").remove();
        $("#dia_comments").remove();
        $('#content_btns .expr_actions').replaceWith(
            expr_actions_template(page_data))
        $('#social_overlay').append(
            social_overlay_template(context.page_data));
        $('#popup_content .counts_icon').each(function(i, el) {
            resize_icon($(this));
        });
        // Reset scroll to top
        $("body").scrollTop(0);
        
        var embed_url = 'https://' + window.location.host + window.location.pathname + '?template=embed';
        $('#dia_embed .copy.embed_code').val("<iframe src='" + embed_url + 
            "' style='width: 100%; height: 100%' marginwidth='0' marginheight='0'" +
            " frameborder='0' vspace='0' hspace='0'></iframe>");

        // Set toggle state for love, broadcast, comment
        o.action_set_state($(".love_btn"), o.action_get_state("love"));
        o.action_set_state($(".republish_btn"), o.action_get_state("republish"));
        o.action_set_state($(".comment_btn"), o.action_get_state("comment"));

        if (page_data.cards == undefined) {
            // In case of direct link with no context,
            // fetch cards from q param, or the default context, @owner

            var set_cards = function(data){
                page_data.cards = data.cards };

            if(context.query.q){
                var query = {q: context.query.q, id: o.expr.id };
                o.controller.get('search', {}, set_cards, query);
                context.page_data.cards_route = {
                    query: query,
                    route_args: { route_name: 'search' }
                };
            }
            else {
                o.controller.get('expressions_public', {
                    owner_name: page_data.expr.owner.name }, set_cards)
                context.page_data.cards_route = {
                    route_args: { route_name: 'expressions_public' }
                };
            }
        }

        var found = find_card(o.expr.id);
        if (found >= 0) {
            var card = page_data.cards[found];
            if (! card.json)
                o.navigate_page(0); // To cache nearby expressions
        }

        animate_expr();

        o.hide_panel();
        $("#content_btns").showshow();
        $(".social_btn").removeClass("hide");

        var show_edit = false
        if(page_data.expr.tags
            && page_data.expr.tags.indexOf("remix") >= 0
        ) page_data.remix = true;

        if (!context.user.logged_in) {
            $("#signup_create").showshow();
            $("#signup_create .signup").removeClass("hide");
            // $('#social_plus').hidehide();
        } else {
            $("#signup_create").showshow();
            $("#signup_create .create").removeClass("hide");

            if(context.user.id == o.expr.owner.id){
                page_data.remix = false
                show_edit = true
            }

            $('#dia_delete_ok').each(function(i, e){
                $(e).data('dialog').opts.handler = function(e, data){
                    o.controller.open('expressions_public',
                        {'owner_name': context.user.name });
                }
            });
        }
        if(show_edit || page_data.remix)
            $('#content_btns .edit_ui').replaceWith(
                edit_btn_template(page_data) )
    }

    o.exit = function(){
        o.last_found = -1;
        hide_exprs();
        o.hide_panel();
        $('#site').showshow();
        $('.page_btn').hidehide();
        $('#content_btns .expr_actions').hide()
    };

    // Check to see if tags overflows its bounds.
    // If so, create "..." tag with associated menu.
    var fixup_tags_list = function () {
        var tags = $(".tag_list a");
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
        var page_data = context.page_data;
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
    var debug = function(text){
        if (0)
            console.log("DEBUG: " + text);
    };

    o.cache_frames = function(expr_ids, current){
        if (expr_ids.length == 0)
            return false;
        var expr_id = expr_ids[0];
        var contentFrame = o.get_expr(expr_id);
        if (contentFrame.length > 0) {
            o.cache_frames(expr_ids.slice(1));
            debug("caching frame, already loaded: " + find_card(expr_id));
            return contentFrame;
        }

        // Create new content frame
        var args = {};
        if(current == undefined) args['no-embed'] = true;
        args['viewport'] = $(window).width() +'x'+ $(window).height();
        var contentFrameURL = o.content_url_base + expr_id +
            '?' + $.param(args);
        contentFrame = $('<iframe class="expr" allowfullscreen>')
            .attr('src', contentFrameURL).attr('id', 'expr_' + expr_id)
            .addClass('expr_hidden').hidehide();

        // Cache the expr data on the card
        var page_data = context.page_data;
        if (page_data.cards != undefined) {
            var found = find_card(expr_id);
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
        debug("caching frame: " + found);

        // Remember all the frames that are loading.
        loading_frame_list = loading_frame_list.concat(contentFrame.eq(0));
        contentFrame.load(function () {
            contentFrame.data('loaded', true);
            debug("loaded frame: " + found);

            if (contentFrame.hasClass('expr_visible')) 
                contentFrame.get(0).contentWindow.postMessage({action: 'show'}, '*');
            for (var i = 0, el; el = loading_frame_list[i]; i++) {
                if (el.prop("id") == contentFrame.prop("id")) {
                    loaded_frame_list.concat(loading_frame_list.splice(i, 1));
                    break;
                }
            }
            if (expr_ids.length > 1)
                o.cache_frames(expr_ids.slice(1))
            // alert("loaded frame.  Others remaining:" + loading_frame_list);
        });
        $('#exprs').append(contentFrame);

        // Remove all but 2 loading frames
        var max_loading_frames = 2;
        var removed_frames = loading_frame_list.splice(0, Math.max(0, loading_frame_list.length - max_loading_frames));
        for (var i = 0, el; el = removed_frames[i]; i++) {
            debug("removing cached frame: " + find_card(el.prop("id").slice(5)));
            el.remove();
        }
        return contentFrame;
    };

    o.play_timer = false;
    // Animate the new visible expression, bring it to top of z-index.
    function animate_expr (){
        var page_data = context.page_data;
        // display_expr(page_data.expr_id);
        var expr_id = page_data.expr_id;
        var expr_curr = $('.expr_visible');
        expr_curr.removeClass('expr_visible');
        $('#exprs').showshow().addClass('animated');
        $('.social_btn').showshow();

        var contentFrame = o.get_expr(expr_id);
        if (contentFrame.length == 0) {
            contentFrame = o.cache_frames([expr_id], true);
        }
        else {
            contentFrame.get(0).contentWindow.
                postMessage({action: 'show'}, '*');
        }
        contentFrame.addClass('expr_visible').removeClass('expr_hidden').showshow();
        contentFrame.showshow();
        $('#exprs .expr').not('.expr_visible').css({'z-index': 0 });
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
                'z-index': 3 }
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
                'z-index': 3 }
            ).animate({
                left: "0"
            }, {
                duration: o.anim_duration,
                complete: hide_other_exprs,
                queue: false })
            expr_curr.css('z-index', 2).animate({
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

        // postMessage only works after the page loads.
        // So page buttons are always visible during expr loading,
        // and once expr loads, they behave normally #page_btn_load_hack
        if(!contentFrame.data('loaded')){
            // bugbug: sometimes this is never followed by a contentFrame.load
            // console.log('showing');
            $('.page_btn').showshow();
        }
        else {
            // console.log('resetting on show');
            o.page_btn_handle();
        }
        contentFrame.load(function(){
            // console.log('resetting on load', contentFrame);
            o.page_btn_handle();
        });

        // password UI and submission
        var password_dia = $('#dia_expr_password');
        var open_passworded_expr = function(password){
            var frame_name = contentFrame.prop('id'),
                content_form = password_dia.find('form.content');
            contentFrame[0].name = frame_name;
            content_form.find('.password').val(password);
            content_form.attr('target', frame_name).submit();
        };

        if(page_data.error == 'password'){
            dialog.create(password_dia).open();
            password_dia.find('form.site').on('success', function(ev, data) {
                if(data.error) {
                    $('#dia_expr_password .error').showshow();
                    return;
                }
                $.extend(context.page_data, data);
                delete context.page_data.error;
                open_passworded_expr(
                    password_dia.find('form.site .password').val());
                o.controller.refresh();
            });
        }
        else if(page_data.expr.password)
            open_passworded_expr(page_data.expr.password);

        // slideshow functionality
        var play_time = parseFloat(context.query.play_time);
        if(play_time){
            clearTimeout(o.play_timer);
            o.play_timer = setTimeout(o.page_next, play_time * 1000);
        }
    };

    var hide_other_exprs = function() {
        var to_hide = $('#exprs .expr').not('.expr_visible,.blank').filter(":visible");
        $('#exprs').removeClass('animated');
        to_hide.each(function(i, el) {
            $(el).get(0).contentWindow.
                postMessage({action: 'hide'}, '*');
        });
        to_hide.addClass('expr_hidden').hidehide();
        fixup_tags_list();
    };

    // TODO: garbage collect expression frames
    var hide_exprs = function() {
        var contentFrame = $('.expr_visible');

        if(contentFrame.length){
            contentFrame.animate({
                top: $(window).height() + 'px'
            },{
                duration: 0, //anim_duration,
                complete: function() {
                    contentFrame.addClass('expr_hidden').hidehide();
                    contentFrame.removeClass('expr_visible');
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
        $('#exprs').hidehide();
        $('.social.overlay').hidehide();
    };

    o.attach_handlers = function(){
        $("#social_close").unbind('click').click(o.social_toggle);
        $(".social_btn").unbind('click').click(o.social_toggle);
        if ($("#site").children().length && context.page_data.cards_route)
            $(".title_spacer .title").addClass("pointer").unbind('click').click(function() {
                o.exit();
                o.controller.direct_fake_open(context.page_data.cards_route.route_args);
                $("body").scrollTop(o.controller.scroll_top);
                o.controller.scroll_top = 0;
            });

        // $('#comment_form').unbind('success').on('success', o.comment_response);
        var dia_comments = $("#dia_comments").data("dialog");
        dia_comments.opts.open = function(){
            $("#dia_comments textarea").focus();
        }
        dia_comments.opts.handler = o.comment_response;
        $("#comment_form").unbind('after_submit').on('after_submit', function() {
            $("#dia_comments textarea[name=text]").prop('disabled', true);
            $("#dia_comments input[type=submit]").prop('disabled', true);
        });

        $('.expr_actions .comment_btn').click(dia_comments.open)

        $(".feed_item").each(function(i, el) {
            edit_button = $(el).find('button[name=edit]');
            delete_button = $(el).find('button[name=delete]');
            if (edit_button.length == 1) {
                edit_button.unbind('click');
                edit_button.click(function(event) {
                    o.edit_comment($(el));
                });
            }
            $(el).find('form').unbind('success').
                on('success', function(event, data) {
                o.edit_comment_response($(el), data);
            });
        });

        $(".love_btn").unbind('click').click(function(){
            o.social_btn_click("love") })
        $(".republish_btn").click(function(){
            o.social_btn_click("republish") })

        $('.page_btn').bind_once('mouseenter', function(event){
            o.page_btn_animate($(this), "in");
        }).bind_once('mouseleave', function(e) {
            o.page_btn_animate($(this), "out");
        });
    };

    o.page_btn_animate = function (el, into) {
        var prop = "opacity";
        var dir = (el.prop("id") == "page_next") ? "" : "-";
        var orig_value = el.css(prop);
        if (el.data(prop))
            orig_value = el.data(prop);
        else
            el.data(prop, orig_value);

        el.stop().css("opacity", (into == "in") ? .2 : .5).animate({
            'opacity': (into == "in") ? 1.0 : orig_value }, {
            duration: 500,
            easing: 'swing'
        });
        return;

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

    o.social_btn_click = function(btn) {
        if (!context.user.logged_in)
            return;

        var el_drawer = $('#' + btn + '_menu')
        var el = $('.' + btn + '_btn')
        var el_form = $("form." + btn)

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
        if (btn == "love") 
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
        resize_icon(el.filter('.counts_icon'));
        o.action_set_state(el, own_item);
    };

    var get_items = function(btn){
        d = { "love": o.expr.loves,
              "comment": o.expr.comments,
              "republish": o.expr.broadcast  };
        return d[btn] ? d[btn] : [];
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
            action:  (btn == "love") ? "Love" : "Broadcast",
            class_name:  (btn == "love") ? "Star" : "Broadcast",
            initiator_name:  context.user.name,
            initiator_thumb_small:  context.user.thumb_small
        };
    };

    o.social_toggle = function(){
        var popup = $('#social_overlay');
        // TODO: animate
        if (popup.css('display') == 'none') {
            popup.showshow()
            // .css("height", 0).animate(
            //     {height:"181px"}, 
            //     {duration:o.anim_duration});
            fixup_tags_list();
        } else {
            popup.hidehide();
        }
    };

    o.edit_comment = function(feed_item){
        var edit_button = feed_item.find('button[name=edit]');
        var delete_button = feed_item.find('button[name=delete]');
        var text_el = feed_item.find('div.text');
        var text = text_el.html();
        if (text_el.is(":hidden")) {
            // Return to uneditable state
            text_el.showshow();
            feed_item.find('textarea').hidehide();
            edit_button.html("Edit");
            delete_button.html("Delete");
            feed_item.find('[name=deletion]').attr('value','delete');
        } else {
            // Settings -> editable state
            text_el.hidehide();
            feed_item.find('textarea').showshow().html(text);
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
            json.comments.reverse().map(function(item){
                comment_box.append(comment_template(item))});

            // update count and highlight state
            $(".counts_icon.comment").find(".counts").text(json.comments.length);
            resize_icon($("#social_overlay .counts_icon.comment"));
            o.action_set_state($(".comment_btn"), o.action_get_state("comment"));
        }
        // TODO-cleanup: merge somehow with existing code to update activity menu
        if (json.user != undefined) {
            top_context = {};
            top_context.activity = json.user.activity;
            context.user.activity = json.user.activity;
            // $('#nav .activity').empty().html(activity_template(top_context));
        }
        o.attach_handlers();
    };
    o.comment_response = function (e, json){
        $('#comment_form textarea').val('').prop('disabled', false).focus();
        $("#comment_form input[type=submit]").prop('disabled', false);

        o.edit_comment_response([], json);
    };

    o.page_prev = function() { o.navigate_page(-1); };
    o.page_next = function() { o.navigate_page(1); };
    o.navigate_page = function(offset){
        var page_data = context.page_data;
        if (page_data.cards != undefined) {
            var len = page_data.cards.length
            var found = find_card(page_data.expr_id);
            // TODO: do we need error handling?
            if (found >= 0) {
                // TODO: need to asynch fetch more expressions and concat to cards.
                found = (found + len + offset) % len;
                if (offset > 0 && found + 5 > len) {
                    on_scroll_add_page();
                }
                // Cache upcoming expressions
                var cache_offsets = o.cache_offsets;
                var expr_ids = [];
                for (var i = 0, off; off = cache_offsets[i]; ++i) {
                    if (offset < 0)
                        off = -off;
                    var found_next = (found + len + off) % len;
                    expr_ids = expr_ids.concat(page_data.cards[found_next].id);
                }
                o.cache_frames(expr_ids);
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
                        o.controller.fake_open('view_expr', data, context.query);
                    } else {
                        o.controller.open('view_expr', data, context.query);
                    }
                }
            }
        }
    };
    // Handles messages from PostMessage (from other frames)
    o.handle_message = function(m){
        var msg = m.data;
        if (msg == "expr_click") {
            popup = $('#social_overlay');
            if (popup.css('display') != 'none')
                o.social_toggle();
            return
        } else if(msg == 'prev' || msg == 'next') {
            o.navigate_page((msg == "prev") ? -1 : 1);
        } else {
            o.page_btn_handle(msg);
        }
    };

    var page_btn_state = '';
    o.page_btn_handle = function(msg){
        if(util.mobile())
            return
        if (!msg)
            msg = page_btn_state;
        // don't render the page buttons if there is nothing to page through!
        if (context.page_data.cards == undefined
            || context.page_data.cards.length == 1) {
            $(".page_btn").hidehide();
            return;
        }

        if(msg == 'show_prev') {
            $('#page_prev').showshow();
            $('#page_next').hidehide();
        } else if(msg == 'show_next') {
            $('#page_next').showshow();
            $('#page_prev').hidehide();
        } else if(msg == 'hide') {
            $('.page_btn').hidehide();
        }

        // should reflect whether left or right page_btn should be visible if
        // page is not loading. See #page_btn_load_hack
        page_btn_state = msg;
    };

    return o;
});
