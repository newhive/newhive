/* 
 * class page
   Top-level entry point for client view rendering.
   Delegates actual rendering to the templates.
 */
define([
    'browser/jquery',
    'ui/nav',
    'ui/new_account',
    'server/context',
    'browser/layout',
    'ui/util',
    'ui/routing',
    'ui/page/pages',
    'sj!templates/card_master.html',
    'sj!templates/home.html',
    'sj!templates/social_overlay.html',
    'sj!templates/overlay.html',
    'sj!templates/profile_edit.html',
    'sj!templates/tags_page.html',
    'sj!templates/activity.html',
    'sj!templates/expr_card_large.html',
    'sj!templates/expr_card_feed.html',
    'sj!templates/expr_card_mini.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html',
    'sj!templates/profile_card.html',
    'sj!templates/icon_count.html',
    'sj!templates/tag_card.html',
    'sj!templates/dialog_embed.html',
    'sj!templates/dialog_share.html',
    'sj!templates/request_invite_form.html'
], function(
    $,
    nav,
    new_account,
    context,
    browser_layout,
    ui_util,
    routing,
    pages,
    master_template,
    home_template,
    social_overlay_template,
    overlay_template,
    profile_edit_template,
    tags_page_template,
    activity_template
){
    var o = {}, expr_page = false, grid_width, controller,
        anim_direction; // 0 = up, +/-1 = right/left
    const anim_duration = 700;

    o.init = function(controller){
        o.anim_direction = 0;
        o.controller = controller;
        nav.render();
        o.render_overlays(); // TODO: move into ./page/expr
        $(window).resize(layout); // TODO: move into dependent pages
        window.addEventListener('message', o.handle_message, false);

        layout();
    };

    o.render_overlays = function(){
        $('#overlays').empty().html(overlay_template());
        $("#page_prev").click(o.page_prev);
        $("#page_next").click(o.page_next);
        $("#social_plus").click(o.social_toggle);
        $("#nav #plus").click(o.social_toggle);
    };

    o.render = function(method, data){
        expr_page = (method == 'expr');
        if(!expr_page) hide_exprs();
        var page_data = data.page_data;
        page_data.layout = method;
        if(pages[method]) pages[method].render(page_data);
        else if(o[method]) o[method](page_data);
        else render_site(page_data);

        // TODO: move to ./page/community
        if (page_data.page == "tag_search") {
            o.render_tag_page();
        }
 
        layout();

        o.attach_handlers();
    };

    o.attach_handlers = function(){
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
        })
    }
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
    }
    o.edit_comment_response = function(feed_item, json){
        // rerender activity feed (only in social overlay and nav menu)
        // with new data received from server
        if (json.activity != undefined) {
            context.activity = json.activity;
            context.page_data.expr.activity = json.activity;
            $('#popup_content .activity').empty().html(activity_template(context));
        }
        if (json.user != undefined) {
            // template_data = context;
            context.activity = json.user.activity;
            context.user.activity = json.user.activity;
            $('#nav .activity').empty().html(activity_template(context));
        }
        delete context.activity;
        o.attach_handlers();
    }
    o.social_toggle = function(){
        popup = $('#social_overlay');
        // TODO: animate
        if (expr_page) {
            if (popup.css('display') == 'none') {
                popup.show();
            } else {
                popup.hide();
            }
        } else {
            // TODO: show tags popup

        }
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
                var page_state = routing.page_state('view_expr', {
                    id: page_data.expr_id,
                    owner_name: page_data.cards[found].owner.name,
                    expr_name: page_data.cards[found].name
                });
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
    o.expr_detail = function(page_data){
        render_site(page_data);
        // expr_column(); // TODO: is this necessary?
    };

    o.grid = function(page_data){
        grid_width = 410;
        render_site(page_data);
    }

    o.forms = function(page_data){
        switch(page_data.form) {
        case "create_account":
            new_account.init(o);
            new_account.render();
            break;
        default:
            $('#site').empty().append(home_template(page_data));
        }
    };

    o.comment_response = function (e, json){
        $('#comment_form textarea').val('');
        o.edit_comment_response([], json);
        // TODO: retrieve response from server with comment,
        // add to comments.
    }

    o.render_tag_page = function(){
        $('#tag_bar').remove();
        $('#site').prepend(tags_page_template(context.page_data));
        $('#follow_tag_form').on('response', o.tag_response);
    }

    o.tag_response = function (e, json){
        // console.log(json)
        context.page_data.viewer.tags_following = json.tags;
        o.render_tag_page();
    }

    o.home = function(page_data){
        page_data.layout = 'profile';
        $('#site').empty().append(home_template(page_data));
    };

    o.profile = function(page_data){
        render_site(page_data);
        expr_column();
        browser_layout.img_fill('#profile_bg');
    };
    o.user_update = function(page_data){
        $('#site').empty().append(profile_edit_template(page_data));
        browser_layout.img_fill('#profile_bg');
        
        $('#profile_thumb_input').on('response',
            on_file_upload('#profile_thumb', '#thumb_id_input'));
        $('#profile_bg_input').on('response',
            on_file_upload('#profile_bg', '#bg_id_input'));

        $('#user_update_form').on('response', function(e, data){
            if(data.error) alert(data.error);
            else{
                var page_state = routing.page_state(
                    'expressions_public', {owner_name: context.user.name });
                o.controller.open_route(page_state);
            }
        });

        $('#email_input, #new_password_input').on('change', function(){
            $('#password_field').removeClass('hide');
        });

        // on_file_upload returns a handler for server response from a
        //   file form submission
        // data from server is list of dicts representing files just uploaded
        // img src is updated based on data
        // input (hidden) value is set to URL from data
        function on_file_upload(img, input){ return function(e, data){
            if(data.error)
                alert('Sorry, I did not understand that file as an image.' +
                'Please try a jpg, png, or if you absolutely must, gif.');
            var el = $(img);
            el.attr('src', data[0].url);
            $(input).val(data[0].file_id);
        }}
    };
    o.profile_private = function(page_data){
        page_data.profile.subheading = 'Private';
        page_data.layout = 'grid';
        render_site(page_data);
        expr_column();
    };

    o.loves = function(page_data){
        page_data.profile.subheading = 'Loves';
        render_site(page_data);
    };

    o.mini = function(page_data){
        page_data.layout = 'grid';
        grid_width = 232 + 20; // padding = 10 + 10
        render_site(page_data);
    };
    
    function hide_exprs() {
        var contentFrame = $('.expr-visible');

        if(contentFrame.length){
            contentFrame.animate({
                top: $(window).height() + 'px'
            },{
                duration: anim_duration,
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
    }

    function hide_expr_complete() {
        $('#exprs').hide();
        $('.overlay').hide();
        $('#nav').prependTo("body");
    }

    function render_site(page_data){
        $('#site').empty().append(master_template(page_data));
    }

    function layout(){
        $('#exprs').css('height', $(window).height());
        $('#site').css('height', $(window).height() - 44);
        browser_layout.center($('#page_prev'), undefined, {'h': false});
        browser_layout.center($('#page_next'), undefined, {'h': false});
        if(context.page_data.layout == 'grid') $('#feed').css('width',
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

    o.add_to_feed = function(page_data){
        $('#feed').append(show_cards(page_data));
    };

    // function replace_or_append(e, replace, append){
    //     var replace = $(replace);
    //     if(replace.length) replace.replaceWith(e);
    //     else $(append).append(e);
    // }

    return o;
});
