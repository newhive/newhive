define([
    'browser/jquery',
    'server/context',
    'ui/editor',
    'ui/page/expr',
    'json!server/compiled.bundles.json',
    'sj!templates/edit.html'
], function(
    $,
    context,
    editor,
    expr_page,
    bundles, 
    edit_template
) {
    var o = {}, contentFrameURLBase = context.is_secure ?
            context.secure_content_server_url : context.content_server_url;

    o.init = function(controller){
        // o.controller = controller;
        // o.render_overlays();
        // window.addEventListener('message', o.handle_message, false);        
        o.controller = controller;
    };
    o.exit = function(){
        $('link.edit').remove();
        $('#site').empty().hide();
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
        $('#site').empty().append(edit_template(page_data)).show();
        $('#nav').hide();
        editor.init(page_data.expr, o);
    };

    o.attach_handlers = function(){
    };

    o.view_expr = function(){
        var expr = context.page_data.expr;
        expr_page.get_expr(expr.id).remove();
        o.controller.open('view_expr', {
            id: expr.id,
            owner_name: expr.owner_name,
            expr_name: expr.name
        });
    };

    return o;
});
