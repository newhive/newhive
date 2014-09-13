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
        save_immediately = true,
        anim_duration = 400,
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
    var ui_page, win = $(window), card_layout;
    o.more_cards = true;
    var on_scroll_add_page = function(){
        if((win.scrollTop() + win.height() + 100 > document.body.scrollHeight)
            && o.more_cards
        ){
            o.controller.next_cards(ui_page.render_new_cards);
        }
    };
    o.render_new_cards = function(data){
        // ugly hack to merge old context attributes to new data
        data.layout = card_layout;
        if(data.cards.length == 0)
            o.more_cards = false;
        else
            cards_template([context.page_data, data])
                .insertBefore('.feed .footer');
    };

    var allow_reorder = function() {
        return context.route.include_tags && context.page_data.cards.length > 1
                && context.page_data.owner
                && context.page_data.owner.id == context.user.id
                && context.page_data.tag_selected != undefined
    };

    var allow_tag_reorder = function() {
        return context.route.include_tags
                && $(".drop_box").length
                && context.page_data.owner
                && context.page_data.owner.id == context.user.id
    };

    var allow_delete = function() {
        return context.route.include_tags
                && context.page_data.tag_selected != "remixed"
                && context.page_data.tag_selected != undefined
                && context.page_data.owner
                && context.page_data.owner.id == context.user.id
    };

    var attach_handlers_cat = function() {
        // auto-loop expressions from main category
        var cur_mini = 0
        var next_slide = function() {
            if ($slides.is(":visible")) {
                $slides.find("a").css({opacity: 0, "pointer-events":"none"})
                var $slide = $slides.find("a:nth(" + cur_mini + ")")
                $slide.css({opacity: 1, "pointer-events":"auto"})
                ++cur_mini
                $slide = $slides.find("a:nth(" + cur_mini + ")")
                if (! $slide.length)
                    cur_mini = 0
            }
        }
        var $slides = context.undefer($(".card[data-num=0] .defer.mini_views"))
        $slides.removeClass("mini_views").bind_once_anon("lazy_load.page", function() {
            if (! $slides.is(".loaded")) return
            $slides.showshow()
                .siblings("",".lazy_load").hidehide()
            // put the 0th slide last so there is no apparent transition between
            // static content and slider
            $slides.find("a:nth(0)").appendTo($slides)
            setInterval(next_slide, 3000)
        })
    }
    o.attach_handlers = function(){
        if (context.route.include_categories)
            attach_handlers_cat()

        // TODO-cleanup: These values need to be saved last in render order
        // but have nothing to do with handlers.
        card_layout = context.page_data.layout;

        $('.feed .expr.card').on('mouseenter', function(event){
            card_animate($(this), "in");
        }).on('mouseleave', function(event){
            card_animate($(this), "out");
        });
        // $(".tags.nav_button").unbind('click').click(show_hide_tags);
        $(".tag_list_container .expander").unbind('click').on('click', function(ev) {
            toggle_more_tags();
        });

        win.unbind('scroll', on_scroll_add_page).scroll(on_scroll_add_page);
        function reorder () {
            var ordered_cards = [];
            var columns = $(".ncolumn .column").filter(
                function(i,e) { return $(e).width(); }).length;
            if (columns == 0) {
                ordered_cards = $(".feed .card");
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
            var ordered_ids = $.map(ordered_cards, function(l, i) {
                return $(l).prop("id").slice(5); });
            if (columns > 0)
                ui_page.layout_columns(ordered_ids);
            ui_page.add_grid_borders();
            return ordered_cards;
        }
        $("form.save_bar").off('before_submit').on('before_submit', function(e){
            var ordered_cards = reorder();
            $(this).find("input[name=deletes]").val(card_deletes);
            card_deletes = 0
            if (context.route.include_categories) {
                $(this).find("input[name=type]").val("categories");
                var ordered = $.map(ordered_cards, function(l, i) {
                    var data_num = $(l).data("num"), card, found = false
                        , cards = context.page_data.cards
                    // Find the card page_data with the matching position data
                    for (var j = 0; j < cards.length; ++j) {
                        card = cards[j]
                        if (card.card_num == data_num) {
                            found = true
                            break
                        }
                    }
                    return found ? card.collection : false
                })
            } else {
                $(this).find("input[name=type]").val("collections");
                var ordered = $.map(ordered_cards, function(l, i) {
                    return $(l).prop("id").slice(5); });
            }
            $(this).find("input[name=new_order]").val(JSON.stringify(ordered));
            $("form.save_bar").hidehide();
        });

        if( allow_reorder() ){
            $(".feed").sortable({
                items: $(".feed .card"),
                start: function (e, ui) {
                    if (! save_immediately)
                        $(".save_bar").showshow();
                },
                stop: function (e, ui) {
                    // ui_page.add_grid_borders();
                    if (! save_immediately)
                        reorder();
                    else
                        $("form.save_bar").submit();
                },
            });
            // $("#site .drop_box").sortable({
            //     connectWith: '#site .tag_list.main',
            //     items: $("#site .drop_box .tag_label"),
            // });
        }
        if( allow_tag_reorder() ){
            $("#site .tag_list.main, #site .drop_box").sortable({
                connectWith: '#site .drop_box, #site .tag_list.main',
                tolerance: 'pointer',
                placeholder: 'place_holder',
                items: $("#site .tag_list.main .tag_label"),
                // start: function (e, ui) {
                //     from_main = (ui.item.parent().hasClass("main"));
                // },

                // sort: function (e, ui) {
                    // (ui.sender ? $(ui.sender) : $(this)).sortable('cancel');
                    // true;
                // },
                beforeStop: function (e, ui) {
                    // if (ui.item.parent().hasClass("main"))
                    //     (ui.sender ? $(ui.sender) : $(this)).sortable('cancel');
                },
                stop: function (e, ui) {
                    // $("form .tag_order .tags").val();
                    var tags = 
                        $(".tag_list.main .drop_box.editable .tag_label").map(
                            function(i,el){ return $(el).text(); });
                    $("form.tag_order input[name=tag_order]").
                        val(tags.toArray().join(","));
                    $("form.tag_order").submit().unbind('success').
                        on('success', function(e, json) {
                            context.page_data.ordered_count = json.tagged_ordered;
                            context.page_data.tag_list = json.tagged;
                            o.preprocess_page_data(context.page_data);
                            $.extend(context.user, json);
                            ui_page.preprocess_context();
                            ui_page.render_main_tags();
                            o.attach_handlers();
                        });
                },
            });
        }

        // hack to make admin_query work
        if(context.route_name == 'admin_query')
            $('form.search_bar').removeAttr('action')
    };

    show_tags = function (show){
        if (show) {
            $(".tag_list_container").showshow();
            // $(".tags.icon").addClass("on");
        } else {
            $(".tag_list_container").hidehide();
            // $(".tags.icon").removeClass("on");
        }
    }
    o.preprocess_page_data = function (page_data){
        page_data.ordered_tags = 
            page_data.tag_list.slice(0, page_data.ordered_count);
        if (context.route.include_categories)
            page_data.extra_tags = 
                page_data.tag_list.slice(page_data.ordered_count);
        else if (0 <= $.inArray(context.route_name,
                ["expressions_public_tags","expressions_private",
                "expressions_tag", "expressions_tag_private"])
        ) {
            page_data.extra_tags = 
                page_data.tag_list.slice(page_data.ordered_count);
        }
        page_data.tag_list = page_data.ordered_tags;
    };

    o.enter = function(){
        o.exit();
        if (context.page_data.owner) {
            $(".network_nav").hidehide();
            show_tags(context.route.include_tags);
        }
        if (o.show_more_tags) toggle_more_tags();
        $(".overlay.panel").showshow();

        o.more_cards = context.page_data.cards
    };
    var toggle_more_tags = function() {
        $(".tag_list.main").toggleClass("expanded");
        o.show_more_tags = ($(".tag_list.main").hasClass("expanded"));
    }
    o.exit = function(){
        $(".network_nav").showshow();
        $(".overlay.panel").hidehide();
    };

    var card_animate = function(card, dir){
        var prop = "opacity"
            ,goal = 1.0
            ,duration = 350
            ,$mini_views = card.find(".mini_views")
        $mini_views.css({opacity: (dir == "in") ? 1 : 0})
        
        $mini_views = context.undefer(card.find(".mini_views.defer"))
        if ($mini_views.length)
            $mini_views.on("lazy_load", function() {
                if (! $mini_views.is(".loaded")) return
                $mini_views.removeClass("lazy_load hide")
                    .appendTo(card.find(".lazy_load.snapshot"))
                if ($mini_views.children().length == 2)
                    $mini_views.addClass("_2col")
                if ($(".card:hover").data("num") == card.data("num"))
                    setTimeout(function() { $mini_views.css({opacity: 1}) }, 1)
            }).css({opacity: 0})
        var el = card.find(".tag_list");
        do_animate(el, dir, prop, goal, duration);
        var delete_pending = function (ev) {
            if (! save_immediately)
                $(".save_bar").showshow();
            card_deletes++;
            var i = card.index();
            card.animate({opacity: 0},
                { duration: anim_duration, complete: function() {
                    if (context.page_data.cards)
                        context.page_data.cards.splice(i, 1);
                    ui_page.add_grid_borders();
                    card.remove();
                    if (save_immediately)
                        $("form.save_bar").submit();
                } });
        };
        if (allow_delete()) {
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
