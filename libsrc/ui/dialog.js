define([
    'browser/jquery',
    'browser/layout'
], function($, layout, dialog_template){
    var factory = { dialogs: [] };

    factory.create = function(element, options){
        var opts = $.extend({
            dialog: $(element),
            opened: false,
            open: function(){},
            handler: factory.generic_dialog_handler,
            close: function(){},
            mandatory: false,
            layout: function(){ layout.center(opts.dialog, $(window)) },
            fade: true
        }, options);
        if(!opts.dialog.length) throw "dialog element " + element + " not found";

        var preexisting = opts.dialog.data('dialog');
        if (preexisting) {
            $.extend(preexisting.opts, options);
            return preexisting;
        }
        var o = $.extend({
            opts: opts
        }, o);
        opts.dialog.data('dialog', o);
        factory.dialogs.push(o);

        // construct element
        // if(!opts.opts.mandatory){
        //     var manual_close = function(){ opts.close(true); };
        //     if( opts.opts.close_btn && ! dialog.find('.btn_dialog_close').length )
        //         $('<div class="btn_dialog_close">').prependTo(dialog).click(manual_close);
        //     opts.shield.click(manual_close);
        //     if(opts.opts.click_close) dialog.click(manual_close);
        // }

        factory.generic_dialog_handler = function(event, json){
            if (json.error != undefined) {
                opts.dialog.find('.error_msg').text(json.error).showshow().
                    hide().fadeIn("slow");
            } else {
                opts.dialog.find('.error_msg').hidehide();
                var el_show = opts.dialog.find(".success_show").unbind("click").click(
                    function() { o.close(); });
                if (el_show.length) {
                    el_show.showshow();
                    opts.dialog.find(".success_hide").hidehide();
                } else {
                    $('#dialog_shield').click();
                }
            }
        };

        o.open = function(){
            if(opts.opened) return;
            opts.opened = true;
            var this_dia = opts.dialog;
            
            // Close any previous dialog. 
            // TODO: Allow multiple dialogs?
            $('#dialog_shield').click();
            opts.shield = $("<div id='dialog_shield'>");
            if(opts.fade) opts.shield.addClass('fade');
            opts.shield.appendTo(document.body).click(o.close);

            o.attach_point = this_dia.parent();
            this_dia.detach();
            // Add to body to create a new z index stack
            this_dia.appendTo(document.body);
            this_dia.removeClass('hide').showshow();
            this_dia.find("form").unbind('response').on('response', opts.handler);
            // For old browsers which don't support autofocus.
            this_dia.find("*[autofocus]").focus();
            this_dia.find(".error_msg").hidehide();
            this_dia.find(".success_show").hidehide();
            this_dia.find(".success_hide").showshow();
            this_dia.find("*[type=cancel]").unbind('click').click(function(e) {
                o.close();
                e.preventDefault(); 
            });
            $(window).resize(opts.layout);
            opts.layout();

            opts.open();
        };

        o.close = function() {
            if(!opts.opened) return;
            opts.opened = false;
            opts.dialog.detach().appendTo(o.attach_point);
            opts.shield.remove();
            $(window).off('resize', opts.layout);
            opts.dialog.hidehide();
            opts.close();
        }

        return o;
    };    

    factory.close_all = function(){
        factory.dialogs.map(function(o){ o.close() });
    }

    // TODO: make functional
    // opts.expr_dialog(id, opts){
    //     $.extend(opts, { absolute: true, layout : function(e) {
    //         var w = e.parent().width(), h = e.parent().height(), a = parseFloat(e.attr('data-aspect'));
    //         if(e.width() / e.height() < w / h) e.width(h * .8 * a).height(h * .8);
    //         else e.width(w * .8).height(w * .8 / a);
    //         center(e, $(window), opts);
    //         place_apps();
    //     } });
    //     return loadDialog(url + '?template=expr_dialog', opts);
    // }

    return factory;
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
