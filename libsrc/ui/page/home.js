define([
    'browser/jquery',
    'server/context'
], function(
    $,
    context
) {
    var o = {};

    o.init = function(controller){
    };
    o.enter = function(){
        $("#nav").show();
    };
    o.exit = function(){
        $("#nav").hide();
    };

    return o;
});
