
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
        if (!context.user.logged_in) {
            var d = dialog.create($("#dia_login_or_join"));
            $(".overlay .signup_btn").unbind('click').click(d.open);
            d = dialog.create($("#login_menu"));
            $(".overlay .login_btn").unbind('click').click(d.open);
        }
    };

    o.enter = function (){
        o.exit();
        // $("#nav").show();
        $("#signup_create").show();
        $(".panel.profile").show();
        $(".logo.overlay").removeClass("hide");
        if (context.user.logged_in) {
            $("#signup_create .create").removeClass("hide");
        } else {
            $("#signup_create .signup").removeClass("hide");
        }
    };
    o.exit = function(){
        // $("#nav").hide();
        $("#signup_create").hide();
        $(".panel.profile").hide();
        $(".logo.overlay").addClass("hide");
        $("#signup_create .signup").addClass("hide");
        $("#signup_create .create").addClass("hide");
    };
    o.attach_handlers = function(){
        $('#feed.profile .expr.card').on('mouseenter', function(event){
            card_animate($(this), "in");
        }).on('mouseleave', function(event){
            card_animate($(this), "out");
        });
    };

    var card_animate = function(card, dir){
        var prop = "opacity";
        var goal = 1.0;
        var duration = 150;
        var el = card.find(".title");

        var orig_value = el.css(prop);
        if (el.data(prop))
            orig_value = el.data(prop);
        else
            el.data(prop, orig_value);
        if (dir == "out") goal = orig_value; 
        var anims = {};
        anims[prop] = goal;
        el.stop().animate(anims, {
            duration: duration,
            easing: 'swing'
        });
    };

    return o;
});
