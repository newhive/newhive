
define([
    'browser/jquery',
    'server/context'
], function(
    $,
    context
) {
    var o = {},
            controller;

    o.init = function(controller){
        o.controller = controller;
    }

    o.enter = function (){
        $("#signup_create").show();
        if (context.user.logged_in) {
            $("#signup_create .create").removeClass("hide");
        } else {
            $("#signup_create .signup").removeClass("hide");
        }
    };
    o.exit = function(){
        $("#signup_create").hide();
        $("#signup_create .signup").addClass("hide");
        $("#signup_create .create").addClass("hide");
    };

    return o;
});
