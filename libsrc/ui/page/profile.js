define([
    'browser/jquery',
    'ui/dialog',
    'server/context',
    'sj!templates/cards.html',
    'require'
], function(
    $,
    dialog,
    context,
    cards_template,
    require
) {
    var o = { name: 'profile' },
            show_tags = true,
            controller;

    o.init = function(controller){
        o.controller = controller;
    };

    o.attach_handlers = function(){
        $('#feed .expr.card').on('mouseenter', function(event){
            card_animate($(this), "in");
        }).on('mouseleave', function(event){
            card_animate($(this), "out");
        });
        if (!context.user.logged_in) {
            var d = dialog.create($("#dia_login_or_join"));
            $(".overlay .signup_btn").unbind('click').click(d.open);
            d = dialog.create($("#login_menu"));
            $(".overlay .login_btn").unbind('click').click(d.open);
        }
        // $(".tags.nav_button").unbind('click').click(show_hide_tags);

        // pagination here
        var win = $(window), feed = $('#feed'), loading = false,
            more_cards = true, page = 0, ui_page = require('ui/page');
        var render_new_cards = function(data){
            // ugly hack to merge old context attributes to new data
            data.card_type = context.page_data.card_type;
            data.layout = context.page_data.layout;
            if(data.cards.length < 20)
                more_cards = false;
            cards_template(data).insertBefore('#feed .footer');
            ui_page.layout_columns();
            ui_page.add_grid_borders();
            loading = false;
            feed = $('#feed'); // rerendering cards loses reference
        };
        win.scroll(function(e){
            if((win.scrollTop() > (feed.height() - win.height()))
                && !loading && more_cards
            ){
                loading = true;
                o.controller.next_cards(render_new_cards);
            }
        });
    };

    // show_hide_tags = function (){
    //     o.show_tags = ! o.show_tags;
    //     show_tags(o.show_tags);
    // }

    show_tags = function (show){
        if (show) {
            $(".tag_list.main").show();
            // $(".tags.icon").addClass("on");
        } else {
            $(".tag_list.main").hide();
            // $(".tags.icon").removeClass("on");
        }
    }
    o.enter = function (){
        o.exit();
        profile_pages=["expressions_public_tags", "following", "expressions_public", "expressions_private","followers", "loves"];
        i = profile_pages.indexOf(context.route_name);
        if (i >= 0) {
            $(".network_nav").hide();
            show_tags((i < 2) ? true : false);
        }
        $("#signup_create").show();
        $("#content_btns").show();
        if (context.user.logged_in) {
            $("#signup_create .create").removeClass("hide");
        } else {
            $("#signup_create .signup").removeClass("hide");
        }
    };
    o.exit = function(){
        $(".network_nav").show();
        $(".tag_list.main").show();
        $("#signup_create").hide();
        $("#content_btns").hide();
        $("#signup_create .signup").addClass("hide");
        $("#signup_create .create").addClass("hide");
    };

    var card_animate = function(card, dir){
        var prop = "opacity";
        var goal = 1.0;
        var duration = 350;
        var el = card.find(".tag_list");
        do_animate(el, dir, prop, goal, duration);
    };

    // TODO: move to util
    var val = function(x) {
        if (typeof(x) == "number")
            return x;
        else if (typeof(x) == "string")
            return parseFloat(x);
        else
            return 0;
    }

    // TODO: should take in dict with prop, duration, easing, ?
    var do_animate = function(el, dir, prop, goal, duration) {
        var curr_value = el.css(prop);
        var orig_value = curr_value;
        var orig_goal = goal;
        if (el.data(prop))
            orig_value = el.data(prop);
        else
            el.data(prop, orig_value);
        if (dir == "out") {
            goal = orig_value;
        }
        var transition_length = val(orig_goal) - val(orig_value);
        if (transition_length != 0) {
            duration *= Math.abs((val(goal) - val(curr_value)) / transition_length);
        }
        var anims = {};
        anims[prop] = goal;
        el.stop().animate(anims, {
            duration: duration,
            easing: 'swing'
        });
    };

    return o;
});
