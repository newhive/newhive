define([
    'browser/jquery',
    'browser/layout',
    'sj!templates/dialog.html'
], function($, layout){
    var o = {};
    o.opened = [];

    o.create = function(element, opts){
        var oo = {
            open: function(){},
            close: function(){},
            mandatory: false,
            layout: 
        };
        oo.dialog = $(name);
        if(!oo.dialog.length) throw "dialog element " + element + " not found";
    };

    o.open = function(template, opts) {
        var o = dialog.data('dialog');
        if(!o) {
            var o = { dialog : dialog };
            dialog.data('dialog', o);

            o.open = function() {
                if(o.opened) return;
                o.opened = true;
                o.opts = $.extend({
                    open : noop, close : noop, absolute : false, fade : true,
                    close: noop, // Function to run if dialog is closed by clicking button or shield
                    mandatory: dialog.hasClass('mandatory'),
                    layout: function() { center(dialog, $(window), opts) },
                    close_btn: true
                }, opts);

                o.shield = $("<div id='dialog_shield'>");
                if(o.opts.fade) o.shield.addClass('fade');
                o.shield.appendTo(document.body);

                dialog.detach().appendTo(document.body)
                    .css('position', o.opts.absolute ? 'absolute' : 'fixed').show();

                if(!o.opts.mandatory) {
                    var manual_close = function(){ o.close(true); };
                    if( o.opts.close_btn && ! dialog.find('.btn_dialog_close').length )
                        $('<div class="btn_dialog_close">').prependTo(dialog).click(manual_close);
                    o.shield.click(manual_close);
                    if(o.opts.click_close) dialog.click(manual_close);
                }

                $(window).resize(function(){ o.opts.layout(o.dialog) });
                o.opts.layout(o.dialog);

                if(o.opts.select) dialog.find(o.opts.select).click();
                o.index = showDialog.opened.length;
                showDialog.opened.push(o);
                o.opts.open();
            }

            o.close = function(manual) {
                // If manual is true this means dialog was closed by clicking button or shield
                showDialog.opened.splice(showDialog.opened.indexOf(o), 1);
                o.shield.remove();
                $(window).unbind('resize', o.opts.layout);
                var clean_up = function() {
                    dialog.hide();
                    o.opts.close();
                    if (manual) o.opts.manual_close();
                    o.opened = false;
                }
                if(o.opts.minimize_to) minimize(dialog, $(o.opts.minimize_to), { 'complete' : clean_up });
                else clean_up();
            }
        }

        return o;
    }

    o.close = function(){
        o.opened[o.opened.length - 1].close();
    }

    // TODO: make functional
    o.expr_dialog(id, opts){
        $.extend(opts, { absolute: true, layout : function(e) {
            var w = e.parent().width(), h = e.parent().height(), a = parseFloat(e.attr('data-aspect'));
            if(e.width() / e.height() < w / h) e.width(h * .8 * a).height(h * .8);
            else e.width(w * .8).height(w * .8 / a);
            center(e, $(window), opts);
            place_apps();
        } });
        return loadDialog(url + '?template=expr_dialog', opts);
    }
});    

function loadDialog(url, opts) {
    $.extend({ absolute : true }, opts);
    var dia;
    if(loadDialog.loaded[url]) {
        dia = loadDialog.loaded[url];
        showDialog(dia,opts);
    }
    else {
        $.ajax({ url : url, dataType: 'text', success : function(h) { 
            var html = h;
            dia = loadDialog.loaded[url] = $(html);
            showDialog(dia,opts);
        }});
    }
}
loadDialog.loaded = {};

function loadDialogPost(name, opts) {
    var dia;
    opts = $.extend({reload: false, hidden: false}, opts);
    if(loadDialog.loaded[name]) {
        dia = loadDialog.loaded[name];
    } 
    if (dia && !opts.reload && !opts.hidden) {
        showDialog(dia,opts);
    } else {
        $.post(window.location, {action: 'dialog', dialog: name}, function(h){
            var html = h;
            if (dia && opts.reload ) {
                dia.filter('div').replaceWith($(html).filter('div'));
            } else {
                dia = loadDialog.loaded[name] = $(html);
                if (!opts.hidden){
                    showDialog(dia,opts);
                }
            }
        }, 'text');
    }
}

function secureDialog(type, opts) {
    var dia;
    var params = $.extend({'domain': window.location.hostname, 'path': window.location.pathname}, opts.params)
    if (loadDialog.loaded[type]) dia = loadDialog.loaded[type];
    else {
        dia = loadDialog.loaded[type] = '<iframe style="' + opts.style + '" src="' + server_url + type + '?' + $.param(params) + '" />';
    }
    return showDialog(dia, opts);
};
showDialog.
