define([
    'browser/jquery', 'text/handlebars', 'templates/context', 'text!templates/nav.html',
    'text!templates/login_form.html'
], function($, template, context, nav_templ, login_templ) {
    var nav_render = template.compile(nav_templ);
    var login_render = template.compile(login_templ);

    function render(server_state){
        $('body').append(nav_render(context));
    }

    return { render: render };
});
