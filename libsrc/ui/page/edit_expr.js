define([
    'browser/jquery',
    'server/context',
    'ui/edit/main',
    'ui/page/expr',
    'browser/layout',
    'sj!templates/edit.html'
], function(
    $,
    context,
    editor,
    expr_page,
    lay,
    edit_template
){
    var o = {};

    o.init = function(controller){
        // o.controller = controller;
        // o.render_overlays();
        // window.addEventListener('message', o.handle_message, false);
        o.controller = controller;
        window.h = editor;
    };

    o.enter = function(){
        o.controller.set_exit_warning("If you leave this page any unsaved " +
            "changes to your expression will be lost.",
            function(){
                return editor.app.Apps.length == 0 }
        );
        $('.edit.overlay').showshow();
        $("body").addClass("edit");
        editor.enter();
    };
    
    o.exit = function(){
        // TODO: don't let user navigate away from page w/o saving
        // TODO: implement autosave
        $('link.edit').remove();
        $('#site').empty();
        $("body").removeClass("edit");
        o.controller.set_exit_warning(false);
        editor.exit();
    };

    o.resize = function(){
        // browser_layout.center($('#page_prev'), undefined, {'h': false});
        // browser_layout.center($('#page_next'), undefined, {'h': false});
        lay.center($('.app_btns'), $('#site'), {v: false});        
    };

    o.render = function(page_data){
        $('#site').empty().append(edit_template(page_data)).showshow();
        $('#nav').hidehide();

        if(!page_data.expr) page_data.expr = {};
        editor.init(page_data.expr, o);
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
