define([
    'browser/jquery',
    'ui/dialog',
    'server/context',
    'sj!templates/cards.html',
    'js!browser/jquery-ui/jquery-ui-1.10.3.custom.js'
], function(
    $,
    dialog,
    context,
    cards_template
) {
    var o = { name: 'profile' },
            show_tags = true,
            show_more_tags = false,
            card_deletes = 0,
            controller;

    o.init = function(controller){
        o.controller = controller;
    };
    o.set_page = function(page){
        ui_page = page;
    }

    // pagination functions here
    var loading = false, ui_page, win = $(window);
    o.more_cards = false;
    var on_scroll_add_page = function(){
        if((win.scrollTop() > ($('#feed').height() - win.height()))
            && !loading && o.more_cards
        ){
            loading = true;
            o.controller.next_cards(render_new_cards);
        }
    };
    var render_new_cards = function(data){
        // ugly hack to merge old context attributes to new data
        data.card_type = context.page_data.card_type;
        data.layout = context.page_data.layout;
        if(data.cards.length < 20)
            o.more_cards = false;
        cards_template(data).insertBefore('#feed .footer');
        ui_page.layout_columns();
        ui_page.add_grid_borders();
        loading = false;
    };

    var allow_reorder = function() {
        return context.route.include_tags && context.page_data.cards.length > 1
                && context.page_data.owner.id == context.user.id
                && context.page_data.tag_selected != undefined
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
        $(".tag_list_container .expander").unbind('click').on('click', function(ev) {
            toggle_more_tags();
        });

        win.unbind('scroll', on_scroll_add_page).scroll(on_scroll_add_page);
        if( allow_reorder() ){
            function reorder () {
                var ordered_cards = [];
                var columns = $(".ncolumn .column").filter(
                    function(i,e) { return $(e).width(); }).length;
                if (columns == 0) {
                    ordered_cards = $("#feed .card").toArray();
                } else {
                    var col_array = [];
                    var card_count = 0;
                    for (var col = 0; col < columns; col++) {
                        // Get the cards in a column, then collate the lists
                        var col_cards = $(".column_" + col + " .card").toArray();
                        card_count += col_cards.length;
                        col_array = col_array.concat([col_cards]);
                    }
                    for (var i = 0; i < card_count; i++) {
                        var card = col_array[i % columns][Math.floor(i / columns)];
                        // Shouldn't happen, but we are seeing column sorting issues.
                        if (card == undefined) {
                            // Protect against infinite loop.
                            // if (i % columns != columns - 1)
                                card_count++;
                            continue;
                        }
                        ordered_cards = ordered_cards.concat(card);
                    };
                }
                var ordered_ids = ordered_cards.map( function(l, i) 
                    { return $(l).prop("id").slice(5); });
                if (columns > 0)
                    ui_page.layout_columns(ordered_ids);
                ui_page.add_grid_borders();
                return ordered_ids;
            }
            $("form.save_bar").on('before_submit', function(e) {
                var ordered_ids = reorder();
                $(this).find("input[name=new_order]").val(ordered_ids.join(","));
                $(this).find("input[name=deletes]").val(card_deletes);
                $("form.save_bar").hidehide();
            });

            $("#feed").sortable({
                items: $("#feed .card"),
                start: function (e, ui) {
                    $(".save_bar").showshow();
                },
                stop: function (e, ui) {
                    // ui_page.add_grid_borders();
                    reorder();
                },
            });
        }
    };

    // show_hide_tags = function (){
    //     o.show_tags = ! o.show_tags;
    //     show_tags(o.show_tags);
    // }

    show_tags = function (show){
        if (show) {
            $(".tag_list_container").showshow();
            // $(".tags.icon").addClass("on");
        } else {
            $(".tag_list_container").hidehide();
            // $(".tags.icon").removeClass("on");
        }
    }
    o.enter = function(){
        o.exit();
        profile_pages=["expressions_tag", "expressions_public_tags", "following",
            "expressions_tag_private", "expressions_private", "expressions_public", 
            "expressions_public_grid", "followers", "loves"];
        i = profile_pages.indexOf(context.route_name);
        if (i >= 0) {
            $(".network_nav").hidehide();
            show_tags((i < 5) ? true : false);
        }
        if (o.show_more_tags) toggle_more_tags();
        $("#signup_create").showshow();
        $("#content_btns").showshow();
        if (context.user.logged_in) {
            $("#signup_create .create").removeClass("hide");
        } else {
            $("#signup_create .signup").removeClass("hide");
        }

        o.more_cards = (context.page_data.cards &&
            (context.page_data.cards.length == 20));
    };
    var toggle_more_tags = function() {
        $(".tag_list.main").toggleClass("expanded");
        o.show_more_tags = ($(".tag_list.main").hasClass("expanded"));
    }
    o.exit = function(){
        $(".network_nav").showshow();
        // $(".tag_list.main").showshow();
        $("#signup_create").hidehide();
        $("#content_btns").hidehide();
        $("#signup_create .signup").addClass("hide");
        $("#signup_create .create").addClass("hide");
    };

    var card_animate = function(card, dir){
        var prop = "opacity";
        var goal = 1.0;
        var duration = 350;
        var el = card.find(".tag_list");
        do_animate(el, dir, prop, goal, duration);
        var delete_pending = function (ev) {
            // goal;prop;el;card;
            $(".save_bar").showshow();
            card_deletes++;
            var i = card.index();
            if (context.page_data.cards)
                context.page_data.cards.splice(i, 1);
            ui_page.add_grid_borders();
            card.remove();
        };
        if (allow_reorder()) {
            el = card.find(".delete");
            do_animate(el, dir, prop, goal, duration);
            el.unbind('click').on('click', delete_pending);
        }
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
