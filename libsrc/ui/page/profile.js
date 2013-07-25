
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
        $("#signup_create").hide();
        $(".panel.profile").hide();
        $(".logo.overlay").addClass("hide");
        $("#signup_create .signup").addClass("hide");
        $("#signup_create .create").addClass("hide");
    };

    return o;
});
