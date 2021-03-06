/* 
 * class page
   Top-level entry point for client view rendering.
   Delegates actual rendering to the templates.
 */
define([
    'jquery',
    'json!ui/routes.json',
    'browser/js',
    'ui/dialog',
    'context',
    'browser/layout',
    'ui/page/pages',
    'ui/routing',
    'moneys/stripe_checkout',

    'sj!templates/password_reset.html',
    'sj!templates/collections.html',
    'sj!templates/overlay.html',
    'sj!templates/card_master.html',
    'sj!templates/tags_main.html',
    'sj!templates/home.html',
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
    'sj!templates/user_byline.html',
    'sj!templates/profile_card.html',
    'sj!templates/icon_count.html',
    'sj!templates/dialog_embed.html',
    'sj!templates/dialog_share.html',
    'sj!templates/login_form.html', 
    'sj!templates/tag_buttons.html', 
    'sj!templates/hive_menu.html', 
    'sj!templates/request_invite_form.html',
    'sj!templates/cards.html'
], function(
    $,
    routes,
    js,
    dialog,
    context,
    browser_layout,
    pages,
    routing,
    StripeCheckout,

    password_template,
    collections_template,
    overlay_template,
    master_template,
    tags_main_template,
    home_template,
    settings_template,
    user_actions_template,
    tags_page_template,
    tag_card_template,
    user_activity_template
){
    var o = {}, expr_page = false, grid_width, controller,
        border_width = 1,
        render_new_cards_func,
        done_overlays = false

    o.init = function(controller){
        // (function() {
        //   var li = document.createElement('script'); li.type = 'text/javascript'; li.async = true;
        //   li.src = ('https:' == document.location.protocol ? 'https:' : 'http:') + '//platform.stumbleupon.com/1/widgets.js';
        //   var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(li, s);
        // })();

        o.controller = controller;
        $(window).resize(o.resize);
    };

    var init_overlays = function(){
        done_overlays = true;
        context.flags.UI.transition_test && $("body").addClass("transition_test")
        $('#overlays').empty().html(overlay_template(context));
        if(!context.user.logged_in){
            o.login_dialog = dialog.create('#dia_login', {
                open: function(){
                    $("#login_form .username").focus();
                    $('#login_form [name=from]').val(window.location);
                }
                // No Async login cuz XHR doesn't reliably set cookies
                // ,handler: function(e, json){
                //     if (json.error != undefined) {
                //         $('#login_form .error_msg').text(json.error).showshow()
                //             .fadeIn("slow");
                //     } else {
                //         o.login_dialog.close();
                //         o.on_login();
                //     } }
                // }
            })
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
        done_overlays = false;
        init_overlays();
        if (routes[context.route_name].require_login 
            || context.route_name == "view_expr") {
            return o.controller.open("home", {});
        }
        o.controller.refresh();
        
        // WIP: content-request-identity
        // un-identify content frame requests
        // var $login = $('<iframe>').attr('src',
        //     routing.page_state('content_logout').api)
        // $login.on('load', function(){ $login.remove() }).appendTo('body')
    };
    // // async login doesn't work
    // o.on_login = function(e) {
    //     context.user.logged_in = true;
    //     // overlays are rendered once on init, so not done on .refresh()
    //     done_overlays = false;
    //     init_overlays();
    //     o.controller.refresh();
    // }
    // WIP: content-request-identity
    // o.content_login = js.once(function(){
    //     // identify content frame requests (currently just for flags)
    //     var $login = $('<iframe>').attr('src',
    //         routing.page_state('content_login').api +
    //         '?session=' + context.user.session.id)
    //     $login.on('load', function(){ $login.remove() }).appendTo('body')
    // })
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
        if (context.route._owner_name) {
            delete context.page_data.owner
        }
    }

    o.render_new_cards = function(data){
        if (render_new_cards_func)
            render_new_cards_func(data);
        o.attach_handlers();
        if (o.column_layout)
            o.layout_columns();
        o.add_grid_borders();
    }
    var has_nav_bar = function() {
        return ($("body").hasClass("nav") && $(".main-header").length)
    }
    var fixup_overlay = function() {
        // Fix styling for this route
        //$('#logo').toggleClass('on', context.route_name == 'home_cat')
        $(".main-header .network_nav .item").removeClass("black_btn")
        $(".main-header .network_nav .item." + context.route_name)
            .addClass("black_btn")
        $(".main-header .header")
            .toggleClass("clean", context.route.client_method != "cat")
        $(".main-header .category_btn").removeClass("black_btn")
        $(".main-header .category_btn[data-name='" 
            + context.page_data.tag_selected + "']").addClass("black_btn")

        var has_nav = has_nav_bar()
            ,has_nav_embedded_logo = has_nav && context.user.logged_in

        // Move the logo handle into/out of the nav bar
        $("#logo").prependTo(has_nav_embedded_logo ? ".main-header .left" :
            "#overlays .overlay.logo_container")
        // And fix up the overlay/hide styles
        $("#overlays .overlay.logo_container").showshow()//.css("background", "transparent")
        $("#overlays .hive_logo")
            // .toggleClass("overlay", ! has_nav_embedded_logo)
            .toggleClass("hide", has_nav && !has_nav_embedded_logo)
        // Reverse the logo menu if it's up top
        if (! $("#logo_menu").is(".inverted") != has_nav_embedded_logo) {
            $("#logo_menu").toggleClass("inverted", ! has_nav_embedded_logo)
                .append($("#logo_menu").children().get().reverse())
        }
        $(".overlay.panel").toggleClass("hide", has_nav || $("body").is(".edit"))
    }
    var body_classes = ""
    o.render = function(method){
        var page_data = context.page_data, expr = page_data.expr
        if (!done_overlays)
            init_overlays();
        
        // set any classes specified by the route
        var new_classes = context.route.body_class // + " " + context.route_name
        $("body").removeClass(body_classes).addClass(new_classes)
        body_classes = new_classes

        if (page_data.title) $("head title").text(page_data.title);
        o.column_layout = false;
        o.columns = 0;
        expr_page = (method == 'expr');

        page_data.layout = method;
        
        dialog.close_all();
        if(context.error == "login" && o.login_dialog){
            o.login_dialog.open();
            $('#login_form .error_msg').showshow().fadeIn("slow");
            delete context.error
        }
        // WIP: content-request-identity
        // if(context.user.logged_in) o.content_login()
        new_page = pages[method];
        if(context.page != new_page){
            if(context.page && context.page.exit)
                context.page.exit()
        }

        o.preprocess_context();
        o.tags = (expr && (expr.tags_index || expr.tags))
            || page_data.tags_search
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

        if (new_page && new_page.enter) new_page.enter();
        o.resize();

        fixup_overlay()
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
        var key = e.which
           ,keychar = String.fromCharCode(key)
        // TODO: move to content frame
        // if( (e.keyCode == 39 || e.keyCode == 37)
        //     && !(e.metaKey || e.ctrlKey || e.altKey)
        //     && $(e.target).is("body")
        // ){
        //     // If paging, go to previous / next expression.
        //     if (context.page && context.page.navigate_page) {
        //         var speed = (e.shiftKey) ? 2 : 1;
        //         context.page.navigate_page((e.keyCode == 39) ? speed : -speed);
        //     }
        // }

        // focus search box on typing, should probably create navigation
        // shortcuts and change this to match only '/'
        if( /*$("#search_box").is(":visible") &&*/
            ! $(":focus").length && !e.altKey && !(e.ctrlKey || e.metaKey)
            && (( /[A-Z0-9]/.test(keychar) && ! e.shiftKey) ||
                (/[A-Z23]/.test(keychar) && e.shiftKey))
        ){
            // Wow that was complicated. keychar will be the *unmodified* state,
            // so to check for @, #, it's 2,3 with shift held.
            var $search_bar = 
                $((has_nav_bar() ? ".main-header" : "#site") + " .search_bar")
            $search_bar.showshow().find("#search_box").focus();
        } else {
            // alert('keyCode: ' + e.keyCode);
        }
    }

    var local_attach_handlers = function(){
        $(".main-header form.search_bar input[type=submit]")
            .bind_once_anon("focus.page", function(ev) {
                var $form = $(this).parents("form")
                $form.find("#search_box").focus()
            })
        $("form.search_bar").bind_once_anon("submit", function(ev) {
            if ($(this).find("#search_box").val() == "")
                return false
        })

        // top nav search box show
        $(".main-header .icon.go_search").bind_once_anon("tap.page mouseenter.page", 
            function(ev) {
                var search_box = $(".main-header #search_box")
                if(search_box.is(':focus')) return
                ev.preventDefault()
                search_box.focus()
        })
        // Animate header
        //if(!context.user.logged_in){
        //    $(window).bind_once_anon("scroll.page", function(ev) {
        //        var scrolled_to = $(this).scrollTop()
        //        if (scrolled_to > 1)
        //            $(".main-header").addClass("condensed")
        //        else
        //            $(".main-header").removeClass("condensed")
        //        search_flow = ''
        //        reflow_nav()
        //    })
        //}

        // Add expression to collection
        var add_to_collection = function(category) { return function(e) {
            var dialog_selector = ".dialog.add_to_collection." + category
                , dialogs = $(dialog_selector)
                , dia = dialogs.data("dialog")
            if (! dia) {
                $('#site').append(collections_template([
                    context.page_data,
                    {tag_type: category}
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
                    .text($(text).val()).addClass("tag_15")
                    .showhide('' != $(text).val());
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

            var card = $(this).parents().filter(".expr.card");
            if (category == "collections" || 
                context.page_data.expr || card.length) {
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
        $(".plus_menu").bind_once_anon('click.page', add_to_collection("collections"))
        $(".plus_cats").bind_once_anon('click.page', add_to_collection("categories"))
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
                follow_response($(this), json)
        })

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
        
        $(document).bind_once('keydown', keydown);
        // var scroll_handler = function(e) {
        //     if (c.route_name == "expr_edit")
        //         return;
        //     $(".overlay.nav").fadeOut("fast");
        //     if (o.scroll_timeout != undefined)
        //         clearTimeout(o.scroll_timeout);
        //     o.scroll_timeout = setTimeout(function() {
        //         o.scroll_timeout = undefined;
        //         if (c.route_name != "expr_edit")
        //             $(".overlay.nav").stop().fadeIn("fast");
        //     }, 100);
        // }
        // $(window).off("scroll", scroll_handler).on("scroll", scroll_handler);
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
            o.controller.open('expressions_feed',
                {owner_name: context.user.name });
            return false;
        });
        $('#user_settings_form').on('success', function(e, data){
            if(data.error) alert(data.error);
            else {
                o.controller.open('expressions_feed',
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
        if (page_data.text_result) {
            $('<pre>').appendTo('#site').text(page_data.text_result)
        }
    }

    var done_layout = false, win_width;
    o.resize = function(){
        if (context.page && context.page.resize)
            context.page.resize();
        done_layout = true;

        if(context.page_data.layout == 'grid' ||
            context.page_data.layout == 'cat' ||
            context.page_data.layout == 'mini'
        ) reflow_grid()

        reflow_nav()
    }

    var reflow_grid = function(){
        var max_columns = context.route.max_columns || 3
            ,win_width = $(window).width()
            ,columns = Math.max(1, Math.min(max_columns, 
                Math.floor( win_width / grid_width)))
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

    var unsettled_nav_height, height_nav_uncondensed = 1
    var reflow_site_margin = function() {
        var new_nav_height = $(".main-header").outerHeight()
        if (unsettled_nav_height != new_nav_height) {
            unsettled_nav_height = new_nav_height
            setTimeout(reflow_site_margin, 200)
            return;
        }
        if (!condensed) {
            height_nav_uncondensed = new_nav_height
            $("#site").css({"margin-top": height_nav_uncondensed + 3 })
            return;
        }
    }
    var nav_size, search_flow, condensed, split
    var reflow_nav = function(){
        // handle layout juggling of fat nav bar for narrow widths
        if(!has_nav_bar()) {
            $("#site").css({"margin-top": 0})
            return
        }

        var logged_in = context.user.logged_in, win_width = $(window).width()
        // TODO: fix margin for uncondensed
        var new_condensed = $('.main-header').hasClass('condensed')
        if (condensed != new_condensed) {
            condensed = new_condensed
            $('.main-header .blurb').insertAfter('.main-header ' + 
                (!condensed ? '.left' : '.nav_top_row'))
        }
        var new_split = !logged_in && !condensed && win_width < 800
        if (split != new_split) {
            split = new_split
            $('.main-header').toggleClass('split', split)
        }

        setTimeout(reflow_site_margin, 200)

        var new_nav_size = ( win_width < 830 &&
            (!condensed && !logged_in) ) ? 'narrow' : 'full'
        if(nav_size != new_nav_size){
            nav_size = new_nav_size
            $('.main-header').removeClass('full narrow').addClass(nav_size)
        }

        var new_search_flow = win_width < 730 ? 'block' : 'inline-block'
        $('.main-header .splash.container, .main-header .left')
            .toggleClass('narrow', win_width < 830)
        if(search_flow != new_search_flow){
            search_flow = new_search_flow
            if(search_flow == 'block')
                $('#search_box').insertAfter('.main-header .nav_top_row')
                    .addClass('block')
            else
                $('#search_box').insertBefore('.main-header .go_search')
                    .removeClass('block')
            $('#search_box').removeClass('full narrow').addClass(nav_size)
        }
    }

    // Move the expr.card's into the feed layout, shuffling them
    // into the shortest column.  
    o.layout_columns = function(ordered_ids){
        o.column_layout = true;
        if (undefined == ordered_ids) {
            ordered_ids = $.map(context.page_data.cards, function(el) {
                return el.id;
            });
            var ordered_nums = $.map(context.page_data.cards, function(el) {
                return el.card_num;
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
        for (var i = 0, card_id; card_id = ordered_ids[i]; ++i) {
            var $card = $("#card_" + card_id)
                ,min = Math.min.apply(null, row_heights)
                ,min_i = row_heights.indexOf(min)
                ,$col = $(".feed .column_" + min_i)
            if (ordered_nums) {
                $card = $(".feed .card[data-num=" + ordered_nums[i] + "]")
            }
            $col.append($card);
            row_heights[min_i] += $card.height();
        };
    };

    // Set up the grid borders
    o.add_grid_borders = function(columns){
        var columns = o.columns;
        $(".feed").toggleClass("wide", columns > 1)
        $(".feed").toggleClass("_3col", columns > 2)
        $(".feed").toggleClass("narrow", columns == 1)
        if(context.page_data.layout != 'grid') return;
        var expr_cards = $('.feed .card');
        // Count of cards which fit to even multiple of columns
        var card_count = expr_cards.length - columns;// - (expr_cards.length % columns);
        expr_cards.each(function(i) {
            var $el = $(this)
                ,border_style = "1px solid #d1d1d1"
            $el.removeAttr('style');

            if (o.column_layout) {
                if (! $el.parent().hasClass("column_0"))
                    $el.css("border-left", border_style);
                else
                    $el.css("border-left", "none");
                if (! $el.is(":first-child"))
                    $el.css("border-top", border_style);
                else
                    $el.css("border-top", "none");
            } else {
                if (i < card_count)
                    $el.css("border-bottom", border_style);
                else
                    $el.css("border-bottom", "none");
                if ((i + 1) % columns != 0 && i + 1 < expr_cards.length)
                    $el.css("border-right", border_style);
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
