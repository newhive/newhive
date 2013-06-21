define([
    'browser/jquery',
    'browser/layout'
], function($, layout, dialog_template){
    var oo = { dialogs: [] };

    oo.create = function(element, opts){
        var o = $.extend({
            dialog: $(element),
            opened: false,
            open: function(){},
            close: function(){},
            mandatory: false,
            layout: function(){ layout.center(o.dialog, $(window)) },
            fade: true
        }, opts);
        oo.dialogs.push(o);
        if(!o.dialog.length) throw "dialog element " + element + " not found";
        if(o.dialog.data('dialog')) return o.dialog.data('dialog');
        o.dialog.data('dialog', o);

        // construct element
        // if(!o.opts.mandatory){
        //     var manual_close = function(){ o.close(true); };
        //     if( o.opts.close_btn && ! dialog.find('.btn_dialog_close').length )
        //         $('<div class="btn_dialog_close">').prependTo(dialog).click(manual_close);
        //     o.shield.click(manual_close);
        //     if(o.opts.click_close) dialog.click(manual_close);
        // }

        o.open = function(){
            if(o.opened) return;
            o.opened = true;

            o.shield = $("<div id='dialog_shield'>");
            if(o.fade) o.shield.addClass('fade');
            o.shield.appendTo(document.body).click(o.close);

            o.dialog.detach().appendTo(document.body).removeClass('hide').show();
            $(window).resize(o.layout);
            o.layout();

            o.open();
        };

        o.close = function() {
            if(!o.opened) return;
            o.opened = false;
            o.shield.remove();
            $(window).off('resize', o.layout);
            o.dialog.hide();
            o.close();
        }

        return o;
    };    

    // TODO: make functional
    // o.expr_dialog(id, opts){
    //     $.extend(opts, { absolute: true, layout : function(e) {
    //         var w = e.parent().width(), h = e.parent().height(), a = parseFloat(e.attr('data-aspect'));
    //         if(e.width() / e.height() < w / h) e.width(h * .8 * a).height(h * .8);
    //         else e.width(w * .8).height(w * .8 / a);
    //         center(e, $(window), opts);
    //         place_apps();
    //     } });
    //     return loadDialog(url + '?template=expr_dialog', opts);
    // }

    return oo;
});

// function loadDialog(url, opts) {
//     $.extend({ absolute : true }, opts);
//     var dia;
//     if(loadDialog.loaded[url]) {
//         dia = loadDialog.loaded[url];
//         showDialog(dia,opts);
//     }
//     else {
//         $.ajax({ url : url, dataType: 'text', success : function(h) { 
//             var html = h;
//             dia = loadDialog.loaded[url] = $(html);
//             showDialog(dia,opts);
//         }});
//     }
// }
// loadDialog.loaded = {};

// function loadDialogPost(name, opts) {
//     var dia;
//     opts = $.extend({reload: false, hidden: false}, opts);
//     if(loadDialog.loaded[name]) {
//         dia = loadDialog.loaded[name];
//     } 
//     if (dia && !opts.reload && !opts.hidden) {
//         showDialog(dia,opts);
//     } else {
//         $.post(window.location, {action: 'dialog', dialog: name}, function(h){
//             var html = h;
//             if (dia && opts.reload ) {
//                 dia.filter('div').replaceWith($(html).filter('div'));
//             } else {
//                 dia = loadDialog.loaded[name] = $(html);
//                 if (!opts.hidden){
//                     showDialog(dia,opts);
//                 }
//             }
//         }, 'text');
//     }
// }

// function secureDialog(type, opts) {
//     var dia;
//     var params = $.extend({'domain': window.location.hostname, 'path': window.location.pathname}, opts.params)
//     if (loadDialog.loaded[type]) dia = loadDialog.loaded[type];
//     else {
//         dia = loadDialog.loaded[type] = '<iframe style="' + opts.style + '" src="' + server_url + type + '?' + $.param(params) + '" />';
//     }
//     return showDialog(dia, opts);
// };
// showDialog.
