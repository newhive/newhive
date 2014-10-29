define(['browser/jquery'], function(jQuery){

// show and hide helpers that use 'hide' class, so elements can have an
// initial show hide state from template
(function($){
    var jqShow = $.fn.show;
    $.fn.showshow = function( speed, easing, callback) {
        $(this).each(function(i, el) {
            if ($(el).hasClass("hide"))
                $(el).removeClass("hide");
            // else
            return jqShow.apply($(el), speed, easing, callback); 
        });
        return jqShow.apply($(this), speed, easing, callback);
    };
}(jQuery));
(function($){
    var jqHide = $.fn.hide;
    $.fn.hidehide = function( speed, easing, callback) {
        //if (elem.hasClass("hide"))
        // if (elem)
            return $(this).addClass("hide");
        return jqHide(speed, easing, callback);
    };
}(jQuery));
(function($){
    $.fn.showhide = function( showhide ) {
        if (showhide) return $(this).showshow();
        else return $(this).hidehide();
    };
}(jQuery));
(function($){
    $.fn.toggleshow = function( speed, easing, callback) {
        var elem = $(this);
        if (elem.hasClass("hide") || elem.css("display") == "none")
            elem.showshow();
        else
            elem.hidehide();
    };
}(jQuery));

// Send extra debug info to the server on every AJAX call
var debug_ajax = function($) {
    var ajax = $.fn.ajax
        ,call_stack = printStackTrace().join('\n\n')
    $.fn.ajax = function() {
        ajax.apply(this, arguments)
    };
};
if (0) // to enable ajax debugging
    debug_ajax(jquery);

// idempotent event binding helpers
(function($){
    // TODO: make menus aware of being disabled
    var wrapper_func = function( event_name, func ) {
        if (["click"].indexOf(event_name) == -1)
            return func
        return function() {
            if ($(this).hasClass("disabled")) 
                return
            return func.apply(this, arguments)
        }
    }
    $.fn.bind_once = function( event_name, func ) {
        return $(this).off(event_name, func).on(event_name, func);
    };
    $.fn.bind_once_anon = function( event_name, func ) {
        return $(this).off(event_name).on(event_name, func);
    };
}(jQuery));

})
