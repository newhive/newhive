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
        $("#nav").showshow();
    };
    o.exit = function(){
        $("#nav").hidehide();
    };
    return o;
});
