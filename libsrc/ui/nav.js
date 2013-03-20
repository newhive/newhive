define([
    'browser/jquery', 'text/handlebars', 'templates/context', 'text!templates/nav.html'
], function($, template, context, navTempl) {
    var nav = template.compile(navTempl);

    function render(server_state){
        $('body').append(nav(context));
    }

    return { render: render };
});
