
define([
    'browser/jquery',
    'ui/dialog',
    'server/context'
], function(
    $,
    dialog,
    context
) {
    var o = {},
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
    };

    o.enter = function (){
        o.exit();
        $("#signup_create").show();
        $("#content_btns").show();
        if (context.user.logged_in) {
            $("#signup_create .create").removeClass("hide");
        } else {
            $("#signup_create .signup").removeClass("hide");
        }
    };
    o.exit = function(){
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
