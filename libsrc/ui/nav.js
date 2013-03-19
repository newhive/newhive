define(
    ['browser/zepto', 'text/mustache', 'mustache!templates/nav.html'],
    function($, Mustache, navTempl) {
        nav = Mustache.compile(navTempl);
        return function(server_state){
            $('body').append(nav({}));
        }
    }
);
