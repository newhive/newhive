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
        $(window).resize(resize);

        resize();
    };

    o.render = function(method, data){
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
        if (context.route_name == "home")
            $("#nav").show();

        // TODO: move to ./page/community
        if (page_data.page == "tag_search") {
            o.render_tag_page();
        }

        if (new_page && new_page.enter) new_page.enter();
        resize();

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
            var el = $(img), thumb = data[0].thumb_big;
            el.attr('src', thumb ? thumb : data[0].url);
            $(input).val(data[0].id);
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
    
    function render_site(page_data){
        $('#site').empty().append(master_template(page_data));
    }

    function resize(){
        $('#exprs').css('height', $(window).height());
        $('#site').css('height', $(window).height() - 44);
        if(context.page_data.layout == 'grid') $('#feed').css('width',
            Math.min(3, Math.floor($(window).width() / grid_width)) * grid_width);
        if (context.page && context.page.resize)
            context.page.resize();
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
