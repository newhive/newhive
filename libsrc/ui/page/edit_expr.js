define([
    'browser/jquery',
    'server/context',
    'ui/editor',
    'ui/page/expr',
    'browser/layout',
    'json!server/compiled.bundles.json',
    'sj!templates/edit.html'
], function(
    $,
    context,
    editor,
    expr_page,
    lay,
    bundles, 
    edit_template
) {
    var o = {};

    o.init = function(controller){
        // o.controller = controller;
        // o.render_overlays();
        // window.addEventListener('message', o.handle_message, false);        
        o.controller = controller;
        curl.expose('ui/editor', 'h'); // for debugging
    };

    o.enter = function(){
        o.controller.set_exit_warning("If you leave this page any unsaved " +
            "changes to your expression will be lost.",
            function(){
                return editor.Apps.length == 0 }
        );
    };
    
    o.exit = function(){
        // TODO: don't let user navigate away from page w/o saving
        // TODO: implement autosave
        $('link.edit').remove();
        $('#site').empty();

        o.controller.set_exit_warning(false);
    };

    o.resize = function(){
        // browser_layout.center($('#page_prev'), undefined, {'h': false});
        // browser_layout.center($('#page_next'), undefined, {'h': false});
        lay.center($('#app_btns'), $('#site'), {v: false});        
    };

    o.render = function(page_data){
        bundles['edit.css'].map(function(url){
            $('<link>').attr({rel: 'stylesheet', href: url})
                .addClass('edit').appendTo('head');
        });
        $('#site').empty().append(edit_template(page_data)).showshow();
        $('#nav').hidehide();

        if(!page_data.expr) page_data.expr = {};
        editor.init(page_data.expr, o);
        setTimeout(o.resize, 0);
        $('.edit.overlay').showshow();
    };

    o.attach_handlers = function(){
    };

    o.view_expr = function(expr){
        // TODO-polish: make controller.open_route actually use this instead
        // of refetching from server
        context.page_data.expr = expr;
        expr_page.get_expr(expr.id).remove();
        o.controller.open('view_expr', {
            id: expr.id,
            owner_name: expr.owner_name,
            expr_name: expr.name
        });
    };

    return o;
});
