define([
    'browser/jquery',
    'server/context',
    'ui/menu',
    'browser/layout',
    'json!server/compiled.bundles.json',
    'sj!templates/edit.html'
], function(
    $,
    context,
    menu,
    browser_layout,
    bundles, 
    edit_template
) {
    var o = {}, contentFrameURLBase = context.is_secure ?
            context.secure_content_server_url : context.content_server_url;

    o.init = function(controller){
        // o.controller = controller;
        // o.render_overlays();
        // window.addEventListener('message', o.handle_message, false);        
    };
    o.exit = function(){
        // hide_exprs();
        $('link.edit').remove();
    };

    o.resize = function(){
        // browser_layout.center($('#page_prev'), undefined, {'h': false});
        // browser_layout.center($('#page_next'), undefined, {'h': false});
    };

    o.render = function(page_data){
        bundles['edit.css'].map(function(url){
            $('<link>').attr({rel: 'stylesheet', href: url})
                .addClass('edit').appendTo('head');
        });
        $('#nav').hide();
        $('#site').empty().append(edit_template(context.page_data)).show();
    };

    o.attach_handlers = function(){
    };

    return o;
});
