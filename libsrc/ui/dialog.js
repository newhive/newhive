define([
    'browser/jquery'
    ,'browser/layout'
    ,'ui/util'
], function($, layout, util){
    var factory = { dialogs: [] };

    factory.create = function(element, options){
        var opts = {};

        var generic_dialog_handler = function(event, json){
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
                    o.close();
                }
            }
        };

        $.extend(opts, {
            dialog: $(element),
            opened: false,
            open: function(){},
            handler: generic_dialog_handler,
            close: function(){},
            mandatory: false,
            layout: function(){ layout.center(opts.dialog, $(window)) },
            fade: true
        }, options);
        if(!opts.dialog.length) throw "dialog element " + element + " not found";
        if(!opts.dialog.is('.dialog')){
            opts.cloned = true
            if(opts.dialog.parent().length)
                opts.dialog = opts.dialog.clone()
            opts.dialog.addClass('dialog').css('z-index',201).removeAttr('id')
                .data('dialog', o)
        }

        var preexisting = opts.dialog.data('dialog');
        if (preexisting) {
            $.extend(preexisting.opts, options);
            return preexisting;
        }
        var o = $.extend({
            opts: opts
            ,dialog: opts.dialog
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
        o.layout = function(){
            var this_dia = o.opts.dialog, _width = this_dia.data("_width")
            if(_width > $(window).width()){
                _width = $(window).width()
                // this_dia.css("width", _width)
            }
            if (util.mobile()) {
                var s = $(window).width() / _width
                s = Math.min(s, $(window).height() / util.val(this_dia.css("height")))
                this_dia.css("transform", "scale("+s+")")
            }
            opts.layout()
        }

        var key_handler = function(e) {
            if (e.keyCode == 27) { // escape
                // If a dialog is up, kill it.
                factory.close_all();
            }
        }
        o.open = function(){
            if(opts.opened) return;
            // TODO: Allow multiple dialogs?
            // Close any previous dialog. 
            // factory.close_all();

            opts.opened = true;
            var this_dia = opts.dialog;
            
            opts.shield = $("<div class='dialog_shield'>");
            if(opts.fade) opts.shield.addClass('fade');
            opts.shield.appendTo(document.body).click(o.close);

            o.attach_point = this_dia.parent();
            this_dia.detach();
            // Add to body to create a new z index stack
            this_dia.appendTo(document.body);
            this_dia.find("form").unbind('success', opts.handler)
                .on('success', opts.handler)
            this_dia.find(".error_msg").hidehide();
            this_dia.find(".success_show").hidehide();
            this_dia.find(".success_hide").showshow();
            this_dia.find("*[type=cancel]").unbind('click').click(function(e) {
                o.close();
                e.preventDefault(); 
            });
            $(window).resize(o.layout);
            // Layout before *and* after.  Before so the window doesn't scroll viewport.
            // After so that it has guaranteed dimension for layout.
            o.layout();
            this_dia.removeClass('hide').showshow();
            // For old browsers which don't support autofocus.
            this_dia.find("*[autofocus]").focus();
            o.undefer()
            if (!this_dia.data("_width"))
                this_dia.data("_width", util.val(this_dia.css("width")));
            o.layout();
            $("body").off('keydown', key_handler).on("keydown", key_handler);
            opts.open();

            return o
        };

        o.undefer = function(){
            $.each(o.opts.dialog.find(".defer"), function (i, el) {
                $(el).replaceWith($($(el).attr("data-content")))
            })
        }

        o.close = function() {
            if(!opts.opened) return;
            opts.opened = false;
            if(opts.cloned){
                opts.dialog.remove()
            }else{
                opts.dialog.detach().appendTo(o.attach_point);
                opts.dialog.hidehide();
            }
            if (opts.shield)
                opts.shield.remove();
            $(window).off('resize', o.layout);
            opts.close();
            if (factory.dialogs.filter(function(d){ d.opened}).length == 0)
                $("body").off('keydown', key_handler)
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
