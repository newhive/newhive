/* 
 * class page
   Top-level entry point for client view rendering.
   Delegates actual rendering to the templates.
 */
define([
    'browser/jquery',
    'json!ui/routes.json',
    'browser/js',
    'ui/dialog',
    'server/context',
    'browser/layout',
    'ui/page/pages',

    'sj!templates/form_overlay.html',
    'sj!templates/password_reset.html',
    'sj!templates/collections.html',
    'sj!templates/overlay.html',
    'sj!templates/card_master.html',
    'sj!templates/tags_main.html',
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
    'sj!templates/request_invite_form.html',
    'js!browser/jquery-ui/jquery-ui-1.10.3.custom.js',
    'sj!templates/cards.html'
], function(
    $,
    routes,
    js,
    dialog,
    context,
    browser_layout,
    pages,

    form_overlay_template,
    password_template,
    collections_template,
    overlay_template,
    master_template,
    tags_main_template,
    home_template,
    profile_edit_template,
    settings_template,
    user_actions_template,
    tags_page_template,
    tag_card_template,
    user_activity_template
){
    var o = {}, expr_page = false, grid_width, controller,
        border_width = 1,
        render_new_cards_func,
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
        // $('#login_form').submit(o.login);
        $('#login_form [name=from]').val(window.location);
        if(!context.user.logged_in){
            o.login_dialog = dialog.create('#dia_login', {
                open: function(){
                    $("#login_form .username").focus(); },
                handler: function(e, json) {
                    if (json.error != undefined) {
                        $('#login_form .error_msg').text(json.error).showshow().fadeIn("slow");
                    } else {
                        o.login_dialog.close();
                        o.on_login();
                    } }
                } );
            $('#login_form .signup').click(function(){
                context.login_form = {
                    username: $("#login_form [name=username]").val()
                    ,secret: $("#login_form [name=secret]").val()
                }
            })

            // request invite form handlers. This form also appears on home page,
            // so this applies to both, and must be done after the top level render
            context.after_render.add('.invite_form [name=email]', function(e){
                e.on('change', function(){
                    $('.invite_form .optional').removeClass('hide');
                });
            });
            context.after_render.add('.invite_form', function(e){
                e.on('success', function(e, data){
                    if(data){ // success
                        $('.request_invite').hidehide();
                        $('.request_sent').removeClass('hide');
                        // TODO: set cookie so request_sent can be shown later
                    }
                    else { // failure
                        $('#request_invite .error').removeClass('hide');
                    }
                });
            });
        } else {
            $('#logout_btn').click(function(){ $('#logout_form').submit(); });
            $('#logout_form').bind('success', o.on_logout);

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
                if(!count) box.hidehide();
                else box.showshow();
                if(data.activity){
                    $('#activity_menu').empty().append(
                        user_activity_template());
                }
            };
            update_activity(context.user);
            $('#activity_form').on('success', function(e, data){
                update_activity(data);
            });
            setInterval(function(){$('#activity_form').submit() }, 180000);
        }
    };

    o.on_logout = function(){
        context.user.logged_in = false;
        // overlays are rendered once on init, so not done on .refresh()
        init_overlays();
        if (routes[context.route_name].require_login 
            || context.route_name == "view_expr") {
            return o.controller.open("home", {});
        }
        o.controller.refresh();
    };
    o.on_login = function(e) {
        context.user.logged_in = true;
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

    o.preprocess_context = function(){
        // For routes that specify the owner, do not show the profile card.
        if (context.route.owner_name)
            delete context.page_data.owner

        var user = context.user;
        user.extra_tags = 
            user.tagged.slice(user.tagged_ordered);
        user.tag_list = 
            user.tagged.slice(0, user.tagged_ordered);
            
        user.categories = user.categories || []
        user.cats_ordered = user.cats_ordered || 0
        user.extra_cats = 
            user.categories.slice(user.cats_ordered);
        user.cat_list = 
            user.categories.slice(0, user.cats_ordered);
    };

    o.render_new_cards = function(data){
        if (render_new_cards_func)
            render_new_cards_func(data);
        o.attach_handlers();
        if (o.column_layout)
            o.layout_columns();
        o.add_grid_borders();
    }
    var custom_classes = ""
    o.render = function(method, data){
        var page_data = context.page_data, expr = page_data.expr
        // set any classes specified by the route
        var new_classes = context.route.custom_classes
        $("body").removeClass(custom_classes).addClass(new_classes)
        custom_classes = new_classes

        if (page_data.title) $("head title").text(page_data.title);
        o.column_layout = false;
        o.columns = 0;
        new_page = pages[method];
        expr_page = (method == 'expr');

        page_data.layout = method;
        
        dialog.close_all();
        if(context.error == "login" && o.login_dialog){
            o.login_dialog.open();
            $('#login_form .error_msg').showshow().fadeIn("slow");
            delete context.error
        }
        if(context.page != new_page){
            if(context.page && context.page.exit)
                context.page.exit()
        }
        o.form_page_exit()

        o.preprocess_context();
        o.tags = (expr && (expr.tags_index || expr.tags))
            || page_data.tags_search
        if (new_page && new_page.preprocess_page_data) 
            pages[method].preprocess_page_data(page_data);
        if (new_page) {
            context.page = new_page;
            if (new_page.render_new_cards)
                render_new_cards_func = new_page.render_new_cards;
            if (new_page.set_page) 
                new_page.set_page(o);
        } else if (context.page) {
            delete context.page;
        }
        if (new_page && new_page.render) 
            pages[method].render(page_data);
        else if(o[method])
            o[method](page_data);
        else
            render_site(page_data);

        // TODO: move to ./page/community
        if (page_data.page == "tag_search") {
            o.render_tag_page();
        }

        o.form_page_enter()
        if (new_page && new_page.enter) new_page.enter();
        o.resize();

        // fix up rounded borders on panel overlay
        var btns = $('.overlay.panel').find('.btn');
        btns.removeClass('left right');
        for(var i = 0, e; (e = btns.eq(i++)).length;){
            if(e.is(':visible')) {
                $(e).addClass('left');
                break;
            }
        }
        for(var i = btns.length - 1, e; (e = btns.eq(i--)).length;){
            if(e.is(':visible')) {
                $(e).addClass('right');
                break;
            }
        }

        o.attach_handlers();
    };

    // BEGIN-layout-methods
    o.profile = function(page_data){
        render_site(page_data)
        expr_column()
    }

    o.grid = function(page_data){
        grid_width = 410;
        render_site(page_data);
        // TODO: BUGBUG: should be data driven
        o.column_layout = (context.route_name == "network");
    }

    // TODO: User cards should use same card size as expression only in search
    o.mini = function(page_data){
        page_data.layout = 'grid';
        grid_width = 222 + 2*10; // padding = 10 + 10
        render_site(page_data);
    };
    o.cat = function(page_data){
        grid_width = 350;
        render_site(page_data);
    };
    // END-layout-methods
    
    // global keypress handler
    var keydown = function(e) {
        if (window.event)
           var key = window.event.keyCode;
        else if (e)
           var key = e.which;
        var keychar = String.fromCharCode(key);
        if ((e.keyCode == 39 || e.keyCode == 37) &&
            !(e.metaKey || e.ctrlKey || e.altKey) &&
            $(e.target).is("body")) {
            // If paging, go to previous / next expression.
            if (context.page && context.page.navigate_page) {
                var speed = (e.shiftKey) ? 2 : 1;
                context.page.navigate_page((e.keyCode == 39) ? speed : -speed);
            }
        } else if (/*$("#search_box").is(":visible") && */
            ! $(":focus").length && !e.altKey && !e.ctrlKey
            && (( /[A-Z0-9]/.test(keychar) && ! e.shiftKey) ||
                (/[A-Z23]/.test(keychar) && e.shiftKey))) 
        {
            // Wow that was complicated. keychar will be the *unmodified* state,
            // so to check for @, #, it's 2,3 with shift held.
            $(".search_bar").showshow();
            $("#search_box").focus();
        } else {
            // alert('keyCode: ' + e.keyCode);
        }
    }

    var height_nav_large = 155
    var local_attach_handlers = function(){
        if (context.flags.new_nav) {
            $(".nav #site").css({"margin-top": height_nav_large})
            // Animate header
            $(window).bind_once_anon("scroll.page", function(ev) {
                var scrolled_to = $(this).scrollTop()
                if (scrolled_to > height_nav_large)
                    $(".main-header").addClass("condensed")
                else
                    $(".main-header").removeClass("condensed")
            })
        }
        // Add expression to collection
        var add_to_collection = function(category) { return function(e) {
            var dialog_selector = ".dialog.add_to_collection." + category
                , dialogs = $(dialog_selector)
                , dia = dialogs.data("dialog")
            if (! dia) {
                $('#site').append(collections_template([
                    context.page_data
                    , {categories: category == "categories"}
                ]));
                dia = dialog.create(dialog_selector, {});
                // var new_tags_autocomplete = false;
                // if (new_tags_autocomplete) {
                //     var all_tags = context.user.tagged.slice(0); // clone
                //     all_tags.sort();
                //     $(".dialog.add_to_collection .tag_name").autocomplete({
                //         source: all_tags,
                //     });
                // }
            }

            var form = $(dialog_selector + " form")
                ,el_tag_name = form.find('input[name=tag_name]')

            form.find('input[name=type]').val(category)
            form.off('after_submit').on('after_submit', dia.close)
            var update_text = function (){
                var text = $(dialog_selector + " .tag_name")
                    ,val = $(text).val()
                    ,val_filtered = val.replace(/[^a-z0-9\_]+/i, '').toLowerCase()
                ;
                if(val != val_filtered) $(text).val( val_filtered );
                $(dialog_selector + " .tag_new")
                    .text($(text).val()).showshow().addClass("tag_15");
                if ('' == $(text).val())
                    $(dialog_selector + " .tag_new").hidehide();
                el_tag_name.val(val_filtered)
            }
            $(dialog_selector + " .tag_name")
                .bind_once('keyup', update_text)
            var submit_add_to_collection = function(tag_name) {
                el_tag_name.val(tag_name)
                form.submit()
            };
            $(dialog_selector + " .tag_list .tag_label").
                unbind('click').on('click', function (e) {
                submit_add_to_collection($(this).text());
            }).addClass("pointer");

            if (category == "collections") {
                var card = $(this).parents().filter(".expr.card");
                var expr_id = ""
                // If the plus button is on a card, use its ID info
                if (card.length) 
                    expr_id = card.prop("id").slice(5);
                else // otherwise use the data in context
                    expr_id = context.page_data.expr_id;
                $(dialog_selector + " input[name=expr_id]").val(expr_id);
                // $(".dialog.add_to_collection .tag_new").text("").hidehide();
            } else { // categories
                $(dialog_selector + " input[name=col_name]").val(
                    context.page_data.tag_selected);
                $(dialog_selector + " input[name=user_id]").val(
                    context.page_data.owner.id);
            }
            update_text();
            dia.open();
        }}
        $(".plus_menu").unbind('click').on('click', add_to_collection("collections"))
        $(".plus_cats").unbind('click').on('click', add_to_collection("categories"))
            .addClass("pointer")
        if (!context.user.logged_in) {
            $(".needs_login").unbind("click").click(function(e) {
                o.login_dialog.open();
                e.preventDefault()
                return false
            });
        }
        $(".user_action_bar form.follow").unbind('success').on('success', 
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
        
        var dia = $("#dia_confirm_deactivate");
        if (dia.length) dia.data("dialog").opts.handler = 
            function(e, j) {
                dialog.generic_dialog_handler(e, j);
                o.on_logout();
            }

        // Special case for logged-out home screen, focus search and 
        // scroll back to top.
        // hack not necessary anymore with conditional autofocus in template
        // if (!context.user.logged_in && context.route_name == "home")
        //     $("body").scrollTop(0);
        // $(".search_bar .hash").unbind('click').click(function(e) {
        //     var search_box = $(".search_bar #search_box");
        //     search_box.val(search_box.val().split(" ").
        //         map(function(w) {return "#" + w.replace("#","");}).join(" "));
        //     $(".search_bar").submit();
        // });
        
        $(document).off('keydown', keydown).on("keydown", keydown);
        var scroll_handler = function(e) {
            if (c.route_name == "edit_expr")
                return;
            return;
            $(".overlay.nav").fadeOut("fast");
            if (o.scroll_timeout != undefined)
                clearTimeout(o.scroll_timeout);
            o.scroll_timeout = setTimeout(function() {
                o.scroll_timeout = undefined;
                if (c.route_name != "edit_expr")
                    $(".overlay.nav").stop().fadeIn("fast");
            }, 100);
        }
        $(window).off("scroll", scroll_handler).on("scroll", scroll_handler);
    };
    o.attach_handlers = function(){
        if(context.page && context.page.attach_handlers)
            context.page.attach_handlers();
        local_attach_handlers();
    }

    o.render_main_tags = function(){
        $("#site>.tag_list_container").replaceWith(
            tags_main_template(context.page_data));
    }

    o.form_page_enter = function(){
        // must be idempotent; called twice for expr pagethroughs
        // TODO: make this work for #Forms beyond "gifwall."
        var page_data = context.page_data
        if(o.tags && o.tags.indexOf("gifwall") >= 0)
            page_data.form_tag = 'gifwall'
        else return

        // only show the #GIFWALL on an expression page
        if (page_data.expr) {
            $("#logo").hidehide();
            $('.overlay.form').remove()
            $('#overlays').append(form_overlay_template(page_data));
        }

        var $create = $("#overlays .create")
        if (!$create.data("href"))
            $create.data("href", $create.attr("href"))
        $create.attr("href", $create.data("href") + "?tags=" + page_data.form_tag)
    }
    o.form_page_exit = function(){
        delete context.page_data.form_tag
        // Clean up old #Form junk
        $("#logo").showshow();
        $('.overlay.form').remove();

        var $create = $("#overlays .create")
        if ($create.data("href"))
            $create.attr("href", $create.data("href"))
    }

    o.render_tag_page = function(){
        $('#tag_bar').remove();
        $('.feed').prepend(tags_page_template(context.page_data));
        var tag_name = context.page_data.tags_search[0];
        $('title').text("#" + tag_name.toUpperCase());
        var header_prefix = ""; // "Search: "
        $('#header span').text("#" + tag_name);
        // var top_context = { "tagnum": 0, "item": tag_name };
        // $('#header span').text(header_prefix).append(tag_card_template(top_context));
        $('#follow_tag_form').on('success', o.tag_response);
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

    // js for settings. TODO: add to separate module
    o.user_settings = function(page_data){
        $('#site').empty().append(settings_template(page_data));

        $('#user_settings_form button[name=cancel]').click(function(e) {
            o.controller.open('expressions_public',
                {owner_name: context.user.name });
            return false;
        });
        $('#user_settings_form').on('success', function(e, data){
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
        
        $('#thumb_form').on('success',
            on_file_upload('#profile_thumb', '#thumb_id_input'));
        $('#bg_form').on('success',
            on_file_upload('#profile_bg', '#bg_id_input'));
        // Click-through help text to appropriate handler
        $(".help_bar").on("click", function(e) {
            $(this).next().trigger(e); 
        });

        $('#user_update_form button[name=cancel]').click(function(e) {
            o.controller.open('expressions_public',
                {owner_name: context.user.name });
            return false;
        });
        $('#user_update_form').on('success', function(e, data){
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
        o.grid(page_data);
        // render_site(page_data);
        // expr_column();
    };

    // o.loves = function(page_data){
    //     page_data.profile.subheading = 'Loves';
    //     render_site(page_data);
    // };

    function render_site(page_data){
        if (page_data.page) {
            // TODO-polish: These functions belong in another module.
            if (page_data.page == 'password_reset') {
                $('#site').empty().append(password_template(page_data));
                var show_error = function(d){
                    if (d.error)
                        $('#user_settings_form .error_msg').showshow().
                            text(d.error);
                };
                show_error(page_data);
                $('#user_settings_form').on('success', function(e, json) {
                    if(json.error)
                        show_error(json);   
                    else 
                        window.location = window.location.origin;
                });
            }
            else
                $('#site').empty().append(master_template(page_data));
        } else
            $('#site').empty().append(master_template(page_data));
    }

    var done_layout = false;
    o.resize = function(){
        if(context.page_data.layout == 'grid' ||
            context.page_data.layout == 'cat' ||
            context.page_data.layout == 'mini') {
            var win_width = $(window).width(),
            columns = Math.max(1, Math.min(3, Math.floor( win_width / grid_width)))
                ,feed_width = columns * (grid_width + border_width)
            if (context.page_data.layout == 'cat')// && columns > 1)
                feed_width = Math.min(3 * (grid_width + border_width),
                    Math.max(win_width, feed_width))
            $('.feed').css('width', feed_width);
            if (o.columns != columns || !done_layout) {
                o.columns = columns;
                if (o.column_layout)
                    o.layout_columns();
                o.add_grid_borders(columns);
            }
        }
        if (context.page && context.page.resize)
            context.page.resize();
        done_layout = true;
    };

    // Move the expr.card's into the feed layout, shuffling them
    // into the shortest column.  
    o.layout_columns = function(ordered_ids){
        o.column_layout = true;
        if (undefined == ordered_ids) {
            ordered_ids = $.map(context.page_data.cards, function(el) {
                return el.id;
            });
        }
        // Resize the columns
        for (var i = 0; i < 3; ++i){
            var col_width = 0;
            if (i < o.columns)
                col_width = grid_width;
            $(".feed .column_"+i).css("width", col_width);
        }

        // Then add the cards into the shortest column
        var row_heights = [];
        for (var i = 0; i < o.columns; ++i){
            row_heights = row_heights.concat(0);
        }
        for (var i = 0, card_id; card_id = ordered_ids[i++];) {
            el_card = $("#card_" + card_id);
            var min = Math.min.apply(null, row_heights);
            var min_i = row_heights.indexOf(min);
            var el_col = $(".feed .column_" + min_i);
            el_col.append(el_card);
            row_heights[min_i] += el_card.height();
        };
    };

    // Set up the grid borders
    o.add_grid_borders = function(columns){
        var columns = o.columns;
        $(".feed").addremoveClass("wide", columns > 1)
        $(".feed").addremoveClass("_3col", columns > 2)
        $(".feed").addremoveClass("narrow", columns == 1)
        if(context.page_data.layout != 'grid') return;
        var expr_cards = $('.feed .card');
        // Count of cards which fit to even multiple of columns
        var card_count = expr_cards.length - columns;// - (expr_cards.length % columns);
        expr_cards.each(function(i) {
            var $el = $(this);
            $el.removeAttr('style');
            if (o.column_layout) {
                if (! $el.parent().hasClass("column_0"))
                    $el.css("border-left", "1px solid black");
                else
                    $el.css("border-left", "none");
                if (! $el.is(":first-child"))
                    $el.css("border-top", "1px solid black");
                else
                    $el.css("border-top", "none");
            } else {
                if (i < card_count)
                    $el.css("border-bottom", "1px solid black");
                else
                    $el.css("border-bottom", "none");
                if ((i + 1) % columns != 0 && i + 1 < expr_cards.length)
                    $el.css("border-right", "1px solid black");
                else
                    $el.css("border-right", "none");
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

    // function replace_or_append(e, replace, append){
    //     var replace = $(replace);
    //     if(replace.length) replace.replaceWith(e);
    //     else $(append).append(e);
    // }

    return o;
});
