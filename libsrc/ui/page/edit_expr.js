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
        // TODO: implement autosave
        $('link.edit').remove();
        $('#site').empty();
        $("body").removeClass("edit");
    };

    o.success = function(ev, ret){
        // Hive.upload_finish();
        if(typeof(ret) != 'object')
            alert("Sorry, something is broken :(. Please send us feedback");
        if(ret.error == 'overwrite') {
            $('#expr_name').html(expr.name);
            $('#dia_overwrite').data('dialog').open();
            $('#save_submit').removeClass('disabled');
        }
        else if(ret.id)
            o.view_expr(ret);
    }
    o.error = function(ev, ret){
        // Hive.upload_finish();
        if (ret.status == 403){
            relogin(function(){ $('#btn_save').click(); });
        }
        $('#save_submit').removeClass('disabled');
    }
    o.submit = function(){
        o.update_expr()
        // TODO-polish-edit-save: consider allowing save dialog to open before
        // files are saved, and showing warning here if unfinished
        // if(!o.save_safe && )
        o.controller.set_exit_warning(false)
        $('#expr_save .expr').val(JSON.stringify(expr))
    }

    o.update_expr = function(){
        expr.name = $('#url').val()
        expr.title = $('#title').val() || '[Untitled]'
        expr.tags = $('#tags_input').val();
        expr.auth = $('#menu_privacy .selected').attr('val');
        if(expr.auth == 'password') 
            expr.password = $('#password').val();
        tags_input_changed()
        if($('#use_custom_domain').val())
            expr.url = $('#custom_url').val()
        expr.container = {}
        $('.button_options input').each(function(i, el){
            el = $(el)
            var btn = el.attr('name')
            if(el.prop('checked'))
                expr.container[btn] = true
        })

        $('title').text('edit - ' + expr.title)
    }
    o.update_form = function(){
        $('#url').val(expr.name)
        $('#title').val(expr.title)
        $('#tags_input').val(expr.tags)
        $('#custom_url').val(expr.url)
        if(expr.auth) $('#menu_privacy [val=' + expr.auth +']').click()
        $('#use_custom_domain').prop('checked', expr.url ? 1 : 0).
            trigger('change')
        var container = expr.container || $.extend({}, default_expr.container)
        for(var btn in container)
            $('[name=' + btn + ']').prop('checked', container[btn])
    }

    o.render = function(page_data){
        $('#nav').hidehide();
        $('#site').empty().append(edit_container_template(page_data)).showshow();
        $('#editor').focus()

        expr = context.page_data.expr || $.extend({}, default_expr)
        if(context.query.tags){
            var tags = (expr.tags || "") + " " + unescape(context.query.tags)
                ,list = o.tag_list(tags)
            expr.tags_index = list
            expr.tags = o.canonical_tags(list)
        }

        o.controller.set_exit_warning(
            "If you leave this page any unsaved "
                + "changes to your expression will be lost."
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
        $('#expr_save').off('success error before_submit')
            .on('success', o.success).on('error', o.error)
            .on('before_submit', o.submit)
        $('#save_submit').off('click').on('click', o.check_url)
        o.init_save_dialog()
        o.update_form()
    };

    o.sandbox_receive = function(ev){
        var msg = ev.data
        if(msg.save){
            expr = msg.save

            // Handle remix
            if (expr.owner_name != context.user.name) {
                expr.owner_name = context.user.name;
                expr.owner = context.user.id;
                expr.remix_parent_id = expr.id;
                expr.id = expr._id = '';
            }

            save_dialog.open()
        }
        if(msg.ready) o.edit_expr()
        if(typeof msg.exit_safe != 'undefined')
            o.exit_safe = msg.exit_safe
        // if(msg.save_safe) o.save_safe = msg.exit_safe
    }
    o.sandbox_send = function(m){
        $('#editor')[0].contentWindow.postMessage(m, '*') }

    o.edit_expr = function(){
        // pass context from server to editor
        var edit_context = js.dfilter(context, ['user', 'flags', 'query'])
        o.sandbox_send({ init: true, expr: expr, context: edit_context})
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

    o.init_save_dialog = function(){
        // TODO: communicate tags to sandbox
        // canonicalize tags field.
        $("#tags_input").change(tags_input_changed)
        $(".remix_label input").change(function(e) {
            if ($(e.target).prop("checked")) {
                $("#tags_input").val("#remix " + $("#tags_input").val());
            } else {
                $("#tags_input").val($("#tags_input").val().replace(/[#,]?remix/gi,""));
                tags_input_changed()
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
        // $("#dia_save").on('keydown', function(e) {
        //     if ((e.keyCode || e.which || e.charCode || 0) == 13) {
        //         $("#save_submit").click();
        //         e.preventDefault();
        //     }
        // });
        
        // Automatically update url unless it's an already saved
        // expression or the user has modified the url manually
        $('#dia_save #title')
            .text(expr.title)
            .on('keydown keyup', function(){
                if (!(expr.home || expr.created || $('#url').hasClass('modified') )) {
                    $('#url').val($('#title').val().replace(/[^0-9a-zA-Z]/g, "-")
                        .replace(/--+/g, "-").replace(/-$/, "").toLowerCase());
                }
            }).keydown()
            .blur(function(){
                $('#title').val($('#title').val().trim());
            }).blur();

        $('#dia_save #url')
            .focus(function(){
                $(this).addClass('modified');
            })
            .change(o.check_url);

        menu('#privacy', '#menu_privacy')
        $('#menu_privacy').click(function(e) {
            $('#menu_privacy div').removeClass('selected');
            var t = $(e.target);
            t.addClass('selected');
            $('#privacy').text(t.text());
            var v = t.attr('val');
            if(v == 'password') $('#password_ui').showshow();
            else $('#password_ui').hidehide();
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

        $('.buttons_toggle').click(function(){
            var check = $.makeArray($('.button_options input')).filter(
                function(el){ return !$(el).prop('checked') }).length > 0
            $('.button_options input').each(function(i, el){
                $(el).prop('checked', check) })
        })
    }

    o.check_url = function(){
        // validate URL
        var name = $('#url').val()
        if(name.match(/[^\w.\/-]/)) {
            alert("Please just use letters, numbers, dash, period and slash in URLs.");
            $('#url').focus();
            return false;
        }
        if(name.match(/^(profile|tag)(\/|$)/)) {
            alert('The name "' + expr.name + '" is reserved.');
            return false;
        }
        return true
    }

    var tags_input_changed = function(){
        var el = $('#tags_input')
        var tags = el.val().trim();
        var tag_list = o.tag_list(tags);
        tags = o.canonical_tags(tag_list)
        $("#tags_input").val(tags);
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
