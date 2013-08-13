/* 
 * class page
   Top-level entry point for client view rendering.
   Delegates actual rendering to the templates.
 */
define([
    'browser/jquery',
    'ui/nav',
    'ui/dialog', 
    'ui/new_account',
    'server/context',
    'browser/layout',
    'ui/util',
    'ui/page/pages',
    'sj!templates/overlay.html',
    'sj!templates/card_master.html',
    'sj!templates/home.html',
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
    dialog,
    new_account,
    context,
    browser_layout,
    ui_util,
    pages,
    overlay_template,
    master_template,
    home_template,
    profile_edit_template,
    tags_page_template,
    activity_template
){
    var o = {}, expr_page = false, grid_width, controller,
        column_layout = false,
        anim_direction; // 0 = up, +/-1 = right/left
    const anim_duration = 700;

    o.init = function(controller){
        o.anim_direction = 0;
        o.controller = controller;
        // nav.render();
        init_overlays();
        $(window).resize(resize);
        // resize();
    };

    var init_overlays = function(){
        $('#overlays').empty().html(overlay_template());
        // render_overlays();
        $('#login_form').submit(login);
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
        } else {
            $('#logout_btn').click(logout);
        }
    };

    ///////////////////////////////
    // var render_overlays = function(){
    //     $('#overlays').empty().html(overlay_template());
    //     // $("#nav #plus").click(o.social_toggle);
    // };
    var login = function(){
        var f = $(this);
        var json_flag = f.find('[name=json]');

        if(location.protocol == 'https:'){
            $.post(f.attr('action'), f.serialize(), function(user){
                if(user){
                    context.user = user;
                    render();
                    require(['ui/controller'], function(ctrl){ ctrl.refresh() });
                }
                else $('.login.error').removeClass('hide');
            });
            return false;
        }
        // can't post between protocols, so pass credentials to site-wide auth
        else{
            var here = window.location;
            f.attr('action', context.secure_server + here.pathname.slice(1) + here.search);
            f.off('submit'); // prevent loop
        }
    };
 
    var logout = function(){
        $.post('/api/user/logout', '', function(){
            context.user.logged_in = false;
            //// This should be redundant when refreshing the whole page
            // init_overlays();
            // o.render(o.method, context);
            require(['ui/controller'], function(ctrl){ ctrl.refresh(); });
        });
    };
    ///////////////////////////////

    o.render = function(method, data){
        console.log(method);
        o.method = method;
        column_layout = false,
        o.columns = 0;
        new_page = pages[method];
        expr_page = (method == 'expr');
        var page_data = data.page_data;
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
        for(var i = 0, e; (e = btns.eq(i--)).length;){
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
        resize();

        if (page_data.title) $("head title").text(page_data.title);
        o.attach_handlers();
    };
    o.attach_handlers = function(){
        if(context.page && context.page.attach_handlers)
            context.page.attach_handlers();

        // global keypress handler
        $("body").keydown(function(e) {
          if(e.keyCode == 27) { // escape
            // If a dialog is up, kill it.
            $('#dialog_shield').click();
          } else {
            // alert('keyCode: ' + e.keyCode);
          }
        });
    }

    o.grid = function(page_data){
        grid_width = 410 + 1;
        render_site(page_data);
        o.column_layout = (JSON.stringify(page_data.header) == 
            JSON.stringify(["Network", "Recent"]))
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

    // js for profile edit. TODO: add to separate module
    o.user_update = function(page_data){
        $('#site').empty().append(profile_edit_template(page_data));
        
        $('#thumb_form').on('response',
            on_file_upload('#profile_thumb', '#thumb_id_input'));
        $('#bg_form').on('response',
            on_file_upload('#profile_bg', '#bg_id_input'));

        $('#user_update_form').on('response', function(e, data){
            if(data.error) alert(data.error);
            else{
                o.controller.open('expressions_public',
                    {owner_name: context.user.name });
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

    function resize(){
        // these lines were causing #site and #exprs to not fill the window
        // $('#exprs').css('height', $(window).height());
        // $('#site').css('height', $(window).height() - 44);
        if(context.page_data.layout == 'grid') {
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
        // First move the cards from column into #feed
        // (to reset to known state)
        var all_cards = $("#feed .expr.card");
        all_cards.prepend($("#feed"));

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
        var expr_cards = $('#feed .expr.card');
        expr_cards.each(function(i) {
            var min = Math.min.apply(null, row_heights);
            var min_i = row_heights.indexOf(min);
            var el_col = $("#feed .column_" + min_i);
            el_col.append($(this));
            row_heights[min_i] += $(this).height();
        });
    };

    // Set up the grid borders
    var add_grid_borders = function(columns){
        var expr_cards = $('#feed .expr.card');
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
