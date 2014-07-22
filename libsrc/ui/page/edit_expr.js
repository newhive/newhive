define([
    'browser/jquery'
    ,'browser/js'
    ,'server/context'
    ,'ui/page/expr'
    ,'ui/dialog'
    ,'ui/menu'

    ,'sj!templates/edit_container.html'
], function(
    $
    ,js
    ,context
    ,expr_page
    ,dialog
    ,menu

    ,edit_container_template
){
    var o = {}, save_dialog, expr, ui_page, default_expr = {
        auth: 'public'
        ,container: {
            facebook_btn: true
            ,twitter_btn: true
            ,love_btn: true
            ,republish_btn: true
            ,comment_btn: true
        }
    }

    o.set_page = function(page){
        ui_page = page;
    }

    o.init = function(controller){
        // o.controller = controller;
        // o.render_overlays();
        o.controller = controller;
    };

    o.enter = function(){
        $("body").addClass("edit");
   };
    
    o.exit = function(){
        $('link.edit').remove();
        $('#site').empty();
        $("body").removeClass("edit");
    };

    o.save_enabled_set = function(v){
        $('#save_submit').addremoveClass('disabled', !v).prop('disabled', !v) }

    o.success = function(ev, ret){
        // Hive.upload_finish();
        if(typeof(ret) != 'object')
            alert("Sorry, something is broken :(. Please send us feedback");
        if(ret.error == 'overwrite') {
            $('#expr_name').html(expr.name);
            $('#dia_overwrite').data('dialog').open();
            o.save_enabled_set(true)
        } else if(ret.autosave) {
            o.sandbox_send({ autosave: (new Date()).getTime() })
            if (ret.expr) {
                $.extend(expr, ret.expr)
                o.update_form()
                // update form will trigger an autosave, so cancel it
                clearTimeout(autosave_timer)
            }
        } else if(ret.id){
            o.controller.set_exit_warning(false)
            o.view_expr(ret)
        }
    }
    o.error = function(ev, ret){
        // Hive.upload_finish();
        if (ret.status == 403){
            relogin(function(){ $('#btn_save').click(); });
        }
        o.save_enabled_set(false)
    }
    o.info_submit = function(){
        if(!o.check_url()) return false
        o.update_expr()
        expr.orig_name = expr.name
        expr.name = $('#save_url').val()
        expr.draft = false
        o.sandbox_send({save_request: 1})
        // fake form never submits
        return false
    }
    o.save_submit = function(){
        $('#expr_save .expr').val(JSON.stringify(expr))
        clearTimeout(autosave_timer)
    }

    o.update_expr = function(){
        // expr.name = $('#save_url').val()
        expr.title = $('#save_title').val()
        expr.tags = $('#save_tags').val()
        expr.auth = $('#menu_privacy .selected').attr('val');
        if(expr.auth == 'password') 
            expr.password = $('#password').val();
        save_tags_changed()
        if($('#use_custom_domain').val())
            expr.url = $('#custom_url').val()
        expr.container = {}
        $('.button_options_menu input').each(function(i, el){
            el = $(el)
            var btn = el.attr('name')
            if(el.prop('checked'))
                expr.container[btn] = true
        })

        $('title').text('edit - ' + expr.title)
    }
    o.update_form = function(){
        $('#save_url').val(expr.name).trigger("input")
        $('#custom_url').val(expr.url)
        $('#save_tags').val(expr.tags)
        $('#save_title').val(expr.title).keydown()
        save_tags_changed()
        // TODO-autosave: remember user's auth choice when draft
        var auth = (expr.draft === true) ? "public" : expr.auth
        // var auth = expr.auth
        if (auth) $('#menu_privacy [val=' + auth +']').click()
        $('#use_custom_domain').prop('checked', expr.url ? 1 : 0).
            trigger('change')
        var container = expr.container || {} // $.extend({}, default_expr.container)
        for(var btn in container)
            $('[name=' + btn + ']').prop('checked', container[btn])
    }

    o.render = function(page_data){
        $('#nav').hidehide();
        $('#site').empty().append(edit_container_template(page_data)).showshow();
        $('#editor').focus()

        expr = context.page_data.expr = ( context.page_data.expr
            || $.extend({}, default_expr) )
        // Handle remix
        var remixed = false
        if ((expr.owner_name && expr.owner_name != context.user.name)
            || context.query.remix !== undefined) {
            expr.owner_name = context.user.name;
            expr.owner = context.user.id;
            if (expr.id) expr.remix_parent_id = expr.id;
            expr.id = expr._id = '';
            delete expr.created;
            remixed = true
        }
        if (context.query.copy !== undefined){
            expr.id = expr._id = '';
            delete expr.created;
            remixed = true
        }
        if (remixed) {
            o.controller.get('expr_unused_name', {}, function(resp) {
                expr.name = resp.name
                o.update_form()
            }, {
                owner_id: expr.owner, name: expr.name
            })
        }

        if(context.query.tags){
            var tags = (expr.tags || "") + " " + unescape(context.query.tags)
                ,list = o.tag_list(tags)
            expr.tags_index = list
            expr.tags = o.canonical_tags(list)
        }

        o.controller.set_exit_warning(
            "If you leave this page any unsaved "
                + "changes to your newhive will be lost."
            , function(){ return o.exit_safe } )
        o.exit_safe = true
        // o.save_safe = true
        // So page has access to the expr content, especially tags
        context.page_data.expr = expr;
    };

    o.attach_handlers = function(){
        window.addEventListener('message', o.sandbox_receive, false);
        save_dialog = dialog.create('#dia_save', {close: function(){
            o.sandbox_send({focus:1}) }})
        $('#editor').on('mouseover', function(){
            o.sandbox_send({focus:1}) })

        $('#expr_info').off('submit').on('submit', o.info_submit)
        $('#expr_save').off('before_submit success error')
            .on('before_submit', o.save_submit)
            .on('success', o.success).on('error', o.error)

        o.init_save_dialog()
        o.update_form()
        // update form will trigger an autosave, so cancel it
        clearTimeout(autosave_timer)
    };

    o.sandbox_receive = function(ev){
        var msg = ev.data
        if(msg.save_dialog)
            save_dialog.open()
        if(msg.save){
            expr.background = msg.save.background
            expr.apps = msg.save.apps
            if (msg.autosave) {
                if (o.controller.ajax_pending())
                    return
                o.update_expr()
                // last_autosave_time = (new Date()).getTime()
            }

            $('#expr_save input[name=autosave]').val(msg.autosave ? 1 : 0)
            $('#expr_save').submit()
        }
        if(msg.ready) o.edit_expr()
        if(typeof msg.exit_safe != 'undefined')
            o.exit_safe = msg.exit_safe
        if(typeof msg.save_safe != 'undefined'){
            o.save_safe = msg.save_safe
            o.save_enabled_set(o.save_safe)
        }
    }
    o.sandbox_send = function(m){
        $('#editor')[0].contentWindow.postMessage(m, '*') }

    o.edit_expr = function(){
        // pass context from server to editor
        var edit_context = js.dfilter(context, ['user', 'flags', 'query', 'config'])
            , revert = $.extend(true, {}, expr)
        // Autosave: restore draft if more recent than save
        if (expr.draft && expr.updated && expr.draft.updated 
            && expr.draft.updated > expr.updated) 
        {
            expr = $.extend(true, {}, expr, expr.draft)
            o.update_form()
        }
        o.sandbox_send({ init: true, expr: expr, context: edit_context, revert: revert})
    }

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

    var autosave_timer
    o.init_save_dialog = function(){
        $("#dia_save").find("input, textarea").bind_once_anon("change", 
            function(ev) {
                if (autosave_timer) 
                    clearTimeout(autosave_timer)
                autosave_timer = setTimeout(function() {
                    o.update_expr()
                    o.sandbox_receive({ data: { save: expr, autosave: 1 } })
                }, 1000)
        })
        // TODO: (why?) communicate tags to sandbox
        // canonicalize tags field.
        $("#save_tags").change(save_tags_changed)
        $(".remix_label input").change(function(e) {
            if ($(e.target).prop("checked")) {
                $("#save_tags").val("#remix " + $("#save_tags").val());
                save_tags_changed()
            } else {
                var i = expr.tags_index.indexOf("remix")
                if (i >= 0) {
                    expr.tags_index.splice(i, 1)
                    var tags = o.canonical_tags(expr.tags_index)
                    $("#save_tags").val(tags);
                    save_tags_changed()
                }
            }
        });
        // save_dialog.opts.open = Hive.unfocus;
        // save_dialog.opts.close = Hive.focus;

        var overwrite_dialog = dialog.create('#dia_overwrite');
        $('#cancel_overwrite').click(overwrite_dialog.close);
        $('#save_overwrite').click(function() {
            expr.overwrite = true;
            $('#expr_save').submit()
        });
        
        // Automatically update url unless it's an already saved
        // expression or the user has modified the url manually 
        $('#dia_save #save_title')
            .text(expr.title)
            .on('keydown keyup', function(){
                if ((expr.draft || !(expr.home || expr.created))
                    && ! $('#save_url').hasClass('modified') ) 
                {
                    var new_val = $('#save_title').val().toLowerCase()
                        .replace(/[^0-9a-zA-Z]/g, "-")
                        .replace(/--+/g, "-").replace(/-$/, "") || expr.name
                    $('#save_url').val(new_val).trigger("input")
                }
            }).keydown()
            .blur(function(){
                $('#save_title').val($('#save_title').val().trim());
            }).blur();

        $('#dia_save #save_url')
            .focus(function(){
                $(this).addClass('modified');
            })
            .blur(function() {
                if (! $(this).val() && expr.name !== '')
                    $(this).removeClass('modified');
            })
            .change(o.check_url)
            .on("input change", function(ev) {
                var new_url = $(this).val()
                if (expr.draft && !new_url)
                    new_url = expr.name
                $('#dia_save .url_bar label span').text(new_url)
            })

        $('#dia_save #save_show_url').on("change", function(ev) {
            $("#dia_save .showhide").showhide($(this).prop("checked"))
            if (!context.flags.custom_domain)
                $("#dia_save #custom_url_box").hidehide();

        })
        menu('#privacy', '#menu_privacy')
        $('#menu_privacy').click(function(e) {
            $('#menu_privacy div').removeClass('selected');
            var t = $(e.target);
            t.addClass('selected');
            $('#privacy .privacy_text').text(t.text());
            var v = t.attr('val');
            if(v == 'password') {
                $('#password_ui').showshow();
                $("#save_submit").text("Save")
            } else {
                $('#password_ui').hidehide();
                $("#save_submit").text("Publish")
            }
        });

        $('#use_custom_domain').change(function(){
            var use = $('#use_custom_domain').prop('checked')
            $('#custom_url_box').showhide(use)
        })

        $('#custom_url').change(function(){
            // strip off protocol from beginning
            var url = $('#custom_url').val()
                .replace(/^.{0,6}\/\//, '').toLowerCase()
            $('#custom_url').val(url)
        })

        $('.extra_buttons .button_options').click(function(){
            var check = $.makeArray($('.button_options_menu input')).filter(
                function(el){ return !$(el).prop('checked') }).length > 0
            $('.button_options_menu input').each(function(i, el){
                $(el).prop('checked', check) })
        })
    }

    o.check_url = function(){
        // validate URL
        var name = $('#save_url').val()
        if(name.match(/[^\w.\/-]/)) {
            alert("Please just use letters, numbers, dash, period and slash in URLs.");
            $('#save_url').focus();
            return false;
        }
        if(name.match(/^(profile|tag)(\/|$)/)) {
            alert('The name "' + expr.name + '" is reserved.');
            return false;
        }
        return true
    }

    var save_tags_changed = function(){
        var el = $('#save_tags')
        var tags = el.val().trim();
        var tag_list = o.tag_list(tags);
        tags = o.canonical_tags(tag_list)
        $("#save_tags").val(tags);
        expr.tags_index = o.tag_list(tags)
        var search_tags = " " + tags.toLowerCase() + " ";
        $(".remix_label input").prop("checked",
            search_tags.indexOf(" #remix ") >= 0);
    }

    o.tag_list = function(tags) {
        tags = tags.split(" ");
        tags = $.map(tags, function(x) {
            return x.toLowerCase().replace(/[^a-z0-9]/gi,'');
        });
        js.array_delete(tags, '')
        return tags
    }
    o.canonical_tags = function(tags_list){
        const special = ["remixed", "gifwall"]

        // context.flags.modify_special_tags = true; // debug
        tags_list = $.map(tags_list, function(x, i) {
            if (special && special.indexOf(x) >= 0) {
                x = js.capitalize(x);
                if (!context.flags.modify_special_tags)
                    x = "";
            }
            return "#" + x;
        });
        if (!context.flags.modify_special_tags && special && expr.tags_index)
            $.map(expr.tags_index, function(x, i) {
                if (special.indexOf(x) >= 0) {
                    x = "#" + js.capitalize(x);
                    tags_list.push(x);
                }
            });
        tags_list = js.array_unique(tags_list)
        js.array_delete(tags_list, '#')
        return tags_list.join(" ")
    }

    return o
});
