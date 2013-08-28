/* 
 * class page
   Top-level entry point for client view rendering.
   Delegates actual rendering to the templates.
 */
define([
    'browser/jquery',
    'browser/js',
    'ui/dialog', 
    'ui/new_account',
    'server/context',
    'browser/layout',
    'ui/util',
    'ui/page/pages',
    'require',
    'sj!templates/overlay.html',
    'sj!templates/card_master.html',
    'sj!templates/home.html',
    'sj!templates/profile_edit.html',
    'sj!templates/settings.html',
    'sj!templates/user_actions.html',
    'sj!templates/tags_page.html',
    'sj!templates/tag_card.html',
    'sj!templates/user_activity.html',
    'sj!templates/expr_card_large.html',
    'sj!templates/expr_card_feed.html',
    'sj!templates/expr_card_mini.html',
    'sj!templates/tag_list.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html',
    'sj!templates/profile_card.html',
    'sj!templates/icon_count.html',
    'sj!templates/dialog_embed.html',
    'sj!templates/dialog_share.html',
    'sj!templates/network_nav.html',
    'sj!templates/login_form.html', 
    'sj!templates/request_invite_form.html'
], function(
    $,
    js,
    dialog,
    new_account,
    context,
    browser_layout,
    ui_util,
    pages,
    require,
    overlay_template,
    master_template,
    home_template,
    profile_edit_template,
    settings_template,
    user_actions_template,
    tags_page_template,
    tag_card_template,
    user_activity_template
){
    var o = {}, expr_page = false, grid_width, controller,
        column_layout = false,
        anim_direction; // 0 = up, +/-1 = right/left
    const anim_duration = 700;

    o.init = function(controller){
        o.anim_direction = 0;
        o.controller = controller;
        init_overlays();
        $(window).resize(o.resize);
    };

    var init_overlays = function(){
        $('#overlays').empty().html(overlay_template());
        // render_overlays();
        $('#login_form').submit(o.login);
        if(!context.user.logged_in){
            var d = dialog.create('#login_menu',  
                { open: function(){ $("#login_menu input[name=username]").focus(); } });
            $('.login_btn').click(d.open);

            if(context.error.login) d.open();

            // request invite form handlers. This form also appears on home page,
            // so this applies to both, and must be done after the top level render
            context.after_render.add('.invite_form [name=email]', function(e){
                e.on('change', function(){
                    $('.invite_form .optional').removeClass('hide');
                });
            });
            context.after_render.add('.invite_form', function(e){
                e.on('response', function(e, data){
                    if(data){ // success
                        $('.request_invite').hide();
                        $('.request_sent').removeClass('hide');
                        // TODO: set cookie so request_sent can be shown later
                    }
                    else { // failure
                        $('#request_invite .error').removeClass('hide');
                    }
                });
            });

            // login_form already rendered in overlay_template()
            // login can't set cookies from cross-domain request
            // so must be done synchronously
            // $('#login_form').on('response', function(e, data){
            //     if(data){
            //         context.user = data;
            //         init_overlays();
            //         o.controller.refresh();
            //         $('#login_menu').data('dialog').close();
            //     } else {
            //         $('#login_form .error').show();
            //     }
            // });
            $('#login_form').on('submit', function(e){
                $('#login_form [name=from]').val(window.location);
            });
        } else {
            $('#logout_btn').click(function(){ $('#logout_form').submit(); });
            $('#logout_form').bind('response', o.on_logout);

            /// notification count and activity menu code

            var activity_opened = false, activity_menu = $('#activity_menu');
            activity_menu.data('menu').opts().open = function(){
                if(!activity_opened)
                    activity_menu.scrollTop(activity_menu[0].scrollHeight);
                activity_opened = true;
                if(context.user.notification_count)
                    $('#notification_reset').submit();
                update_activity({notification_count:0});
            };

            var update_activity = function(data){
                var count = data.notification_count,
                    box = $('#activity_btn .count').html(count);
                js.copy(data, context.user);
                if(!count) box.hide();
                else box.show();
                if(data.activity){
                    $('#activity_menu').empty().append(
                        user_activity_template());
                }
            };
            update_activity(context.user);
            $('#activity_form').on('response', function(e, data){
                update_activity(data);
            });
            setInterval(function(){$('#activity_form').submit() }, 180000);
        }
    };

    o.on_logout = function(){
        context.user.logged_in = false;
        // overlays are rendered once on init, so not done on .refresh()
        init_overlays();
        o.controller.refresh();
    };
    o.logout = function(){
        $.post('/api/user/logout', '', o.on_logout);
    };

    ///////////////////////////////
    // form responses
    var follow_response = function (e, json){
        // TODO: make stringjay track state (parent tree of with's)
        // so we don't have to
        local_context = {};
        if ($("#social_overlay").has(e).length) {
            local_context["brief"] = true
            // TODO: server should package the data exactly how it is in context
            // so we don't have to munge it on client
            context.page_data.expr.owner.listening = json.state;
            $.extend(true, local_context, context.page_data.expr.owner);
        } else {
            context.page_data.owner.listening = json.state;
            $.extend(true, local_context, context.page_data.owner);
        }
        // local_context["id"] = json.entity;
        e.parent().empty().append(user_actions_template(local_context).children());
        // TODO: put button hookup into an after_render
        local_attach_handlers();
    };
    ///////////////////////////////

    o.render = function(method, data){
        console.log(method);
        var page_data = data.page_data;
        if (page_data.title) $("head title").text(page_data.title);
        o.method = method;
        column_layout = false,
        o.columns = 0;
        new_page = pages[method];
        expr_page = (method == 'expr');
        page_data.layout = method;
        if (context.page != new_page) {
            if (context.page && context.page.exit) 
                context.page.exit();
        }
        if (new_page) {
            context.page = new_page;
        } else if (context.page) {
            delete context.page;
        }
        if (new_page && new_page.render) 
            pages[method].render(page_data);
        else if(o[method])
            o[method](page_data);
        else
            render_site(page_data);

        // fix up rounded borders on content_btns overlay
        var btns = $('#content_btns').find('.btn');
        btns.removeClass('left right');
        for(var i = 0, e; (e = btns.eq(i++)).length;){
            if(!e.hasClass('hide')) {
                $(e).addClass('left');
                break;
            }
        }
        for(var i = btns.length - 1, e; (e = btns.eq(i--)).length;){
            if(!e.hasClass('hide')) {
                $(e).addClass('right');
                break;
            }
        }

        // TODO: move to ./page/community
        if (page_data.page == "tag_search") {
            o.render_tag_page();
        }

        if (new_page && new_page.enter) new_page.enter();
        o.resize();

        o.attach_handlers();
    };
    var generic_dialog_handler = function(event, json){
        if (json.error != undefined) {
            $(this).parents().filter(".dialog").find('.error_msg').text(json.error).show();
        } else {
            $('#dialog_shield').click();
        }
    };
    var local_attach_handlers = function(){
        $('.user_action_bar form.follow').unbind('response').on('response', 
            function(event, json) {
                follow_response($(this), json); 
        });

        // Belongs in edit
        $("textarea.about").keypress(function(e) {
            // Check the keyCode and if the user pressed Enter (code = 13) 
            // disable it
            if (event.keyCode == 13) {
                event.preventDefault();
            }
        });
        // Belongs in "community"
        $("#search_box").focus();
        $("#form_send_mail").unbind('response').on('response', generic_dialog_handler);
        
        // global keypress handler
        $("body").keydown(function(e) {
            if(e.keyCode == 27) { // escape
                // If a dialog is up, kill it.
                $('#dialog_shield').click();
            } else {
                // alert('keyCode: ' + e.keyCode);
            }
        });
    };
    o.attach_handlers = function(){
        if(context.page && context.page.attach_handlers)
            context.page.attach_handlers();
        local_attach_handlers();
    }

    o.grid = function(page_data){
        grid_width = 410;
        render_site(page_data);
        o.column_layout = true;//(context.route == "");
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

    o.render_tag_page = function(){
        $('#tag_bar').remove();
        $('#feed').prepend(tags_page_template(context.page_data));
        var tag_name = context.page_data.tags_search[0];
        $('title').text("#" + tag_name.toUpperCase());
        var header_prefix = ""; // "Search: "
        $('#header span').text("#" + tag_name);
        // var top_context = { "tagnum": 0, "item": tag_name };
        // $('#header span').text(header_prefix).append(tag_card_template(top_context));
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
    };

    // js for settings. TODO: add to separate module
    o.user_settings = function(page_data){
        $('#site').empty().append(settings_template(page_data));

        $('#user_settings_form button[name=cancel]').click(function(e) {
            o.controller.open('expressions_public',
                {owner_name: context.user.name });
            return false;
        });
        $('#user_settings_form').on('response', function(e, data){
            if(data.error) alert(data.error);
            else {
                o.controller.open('expressions_public',
                    {owner_name: context.user.name });
            }
        });

        $('#email_input, #new_password_input').on('keyup', function(e) {
            if ($("#new_password_input").val() ||
                $("#email_input").val() != context.user.email) {
                $('#password_field').removeClass('hide');
            }
        });
    };

    // js for profile edit. TODO: add to separate module
    o.user_update = function(page_data){
        $('#site').empty().append(profile_edit_template(page_data));
        
        $('#thumb_form').on('response',
            on_file_upload('#profile_thumb', '#thumb_id_input'));
        $('#bg_form').on('response',
            on_file_upload('#profile_bg', '#bg_id_input'));

        $('#user_update_form button[name=cancel]').click(function(e) {
            o.controller.open('expressions_public',
                {owner_name: context.user.name });
            return false;
        });
        $('#user_update_form').on('response', function(e, data){
            if(data.error) alert(data.error);
            else {
                o.controller.open('expressions_public',
                    {owner_name: context.user.name });
            }
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
            var el = $(img), thumb = data[0].thumb_big;
            el.attr('src', thumb ? thumb : data[0].url);
            $(input).val(data[0].id);
        }}
    };
    o.profile_private = function(page_data){
        // page_data.profile.subheading = 'Private';
        
        page_data.layout = 'grid';
        render_site(page_data);
        expr_column();
    };

    // o.loves = function(page_data){
    //     page_data.profile.subheading = 'Loves';
    //     render_site(page_data);
    // };

    o.mini = function(page_data){
        page_data.layout = 'grid';
        grid_width = 232 + 20 + 1; // padding = 10 + 10
        render_site(page_data);
    };
    
    function render_site(page_data){
        $('#site').empty().append(master_template(page_data));
    }

    o.resize = function(){
        // these lines were causing #site and #exprs to not fill the window
        // $('#exprs').css('height', $(window).height());
        // $('#site').css('height', $(window).height() - 44);
        if(context.page_data.layout == 'grid' || context.page_data.layout == 'mini') {
            var columns = Math.min(3, Math.floor($(window).width() / grid_width));
            $('#feed').css('width', columns * grid_width);
            if (o.columns != columns) {
                o.columns = columns;
                if (o.column_layout)
                    layout_columns();
                add_grid_borders(columns);
            }
        }
        if (context.page && context.page.resize)
            context.page.resize();
    };

    // Move the expr.card's into the feed layout, shuffling them
    // into the shortest column.  The order is not preserved.
    // TODO: preserve order.
    var layout_columns = function(){
        // Resize the columns
        for (var i = 0; i < 3; ++i){
            var col_width = 0;
            if (i < o.columns)
                col_width = grid_width;
            $("#feed .column_"+i).css("width", col_width);
        }

        // Then add the cards into the shortest column
        var row_heights = [];
        for (var i = 0; i < o.columns; ++i){
            row_heights = row_heights.concat(0);
        }
        var cards = context.page_data.cards;
        for (var i = 0, card; card = cards[i++];) {
            el_card = $("#card_" + card.id);
            var min = Math.min.apply(null, row_heights);
            var min_i = row_heights.indexOf(min);
            var el_col = $("#feed .column_" + min_i);
            el_col.append(el_card);
            row_heights[min_i] += el_card.height();
        };
    };

    // Set up the grid borders
    var add_grid_borders = function(columns){
        var expr_cards = $('#feed .card');
        // Count of cards which fit to even multiple of columns
        var card_count = expr_cards.length - (expr_cards.length % columns);
        expr_cards.each(function(i) {
            if (o.column_layout) {
                if (! $(this).parent().hasClass("column_0"))
                    $(this).css("border-left", "1px solid black");
                else
                    $(this).css("border-left", "none");
                if (! $(this).is(":first-child"))
                    $(this).css("border-top", "1px solid black");
                else
                    $(this).css("border-top", "none");
            } else {
                if (i < card_count)
                    $(this).css("border-bottom", "1px solid black");
                else
                    $(this).css("border-bottom", "none");
                if ((i + 1) % columns != 0 && i + 1 < expr_cards.length)
                    $(this).css("border-right", "1px solid black");
                else
                    $(this).css("border-right", "none");
            }
        });
    };

    function expr_column(){
        // TODO: put actual rendering code here?

        // fix background spacing on line breaks
        $('.card .words').each(function(){
            var e = $(this);
            if(e.hasClass('spaced')) return;
            e.html(e.html().replace(/ |$/g, '&nbsp; '));
            e.addClass('spaced');
        });
    };

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
