define([
    'browser/jquery',
    'server/context',
    'ui/page/expr',
    'ui/dialog',
    'ui/menu',
    'sj!templates/edit_container.html'
], function(
    $,
    context,
    expr_page,
    dialog,
    menu,
    edit_container_template
){
    var o = {}, save_dialog, expr;

    o.init = function(controller){
        // o.controller = controller;
        // o.render_overlays();
        o.controller = controller;
    };

    o.enter = function(){
        $("body").addClass("edit");
        window.addEventListener('message', o.message, false);
    };
    
    o.exit = function(){
        // TODO: don't let user navigate away from page w/o saving
        // TODO: implement autosave
        $('link.edit').remove();
        $('#site').empty();
        $("body").removeClass("edit");
    };

    var on_response = function(ev, ret){
        // Hive.upload_finish();
        if(typeof(ret) != 'object')
            alert("Sorry, something is broken :(. Please send us feedback");
        if(ret.error == 'overwrite') {
            $('#expr_name').html(expr.name);
            $('#dia_overwrite').data('dialog').open();
            $('#save_submit').removeClass('disabled');
        }
        // TODO: hookup
        // else if(ret.id) Hive.edit_page.view_expr(ret);
    }, on_error = function(ev, ret){
        // Hive.upload_finish();
        if (ret.status == 403){
            relogin(function(){ $('#btn_save').click(); });
        }
        $('#save_submit').removeClass('disabled');
    }, submit = function(){
        expr.name = $('#url').val()
        expr.title = $('#title').val();
        expr.tags = $('#tags_input').val();
        expr.auth = $('#menu_privacy .selected').attr('val');
        if(expr.auth == 'password') 
            expr.password = $('#password').val();
        $('#expr_save .expr').val(JSON.stringify(expr))
    };

    o.render = function(page_data){
        $('#nav').hidehide();
        $('#site').empty().append(edit_container_template(page_data)).showshow();
    };

    o.message = function(msg){
        save = msg.data.save
        if(save){
            expr = save

            // Handle remix
            if (expr.owner_name != context.user.name) {
                expr.owner_name = context.user.name;
                expr.owner = context.user.id;
                expr.remix_parent_id = expr.id;
                expr.id = expr._id = '';
            }

            save_dialog.open()
        }
        // TODO: add warning when upload in progress in sandbox
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

    o.attach_handlers = function(){
        save_dialog = dialog.create('#dia_save')
        $('#expr_save').on('response', on_response).on('error', on_error)
            .on('before_submit', submit)
        $('#save_submit').on('click', o.check_url)
        expr = context.page_data.expr || {}
        o.init_save_dialog()
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

    // Called on load() and save()
    o.save_or_load = function(){
        var query = location.search.slice(1);
        if (query.length) {
            if (query == "new_user") 
            {
                $("#dia_editor_help").data("dialog").open();
            } else {
                // otherwise query is assumed to be tag list
                $tags = $("#tags_input");
                var e = {target:$tags};
                // TODO: hookup
                // var tags = (Hive.Exp.tags || "") + " " + unescape(query);
                // Hive.set_tag_index(Hive.tag_list(tags));
                $tags.val(tags).trigger("change",e);
            }
        }
        $('title').text("edit - " + (expr.title || "[Untitled]"));
        var tags = " " + $("#tags_input").val().trim() + " ";
        // env.copy_table = context.flags.copy_table || false;
        // env.gifwall = (tags.indexOf(" #Gifwall ") >= 0);

        // env.squish_full_bleed = env.gifwall;
        // env.show_mini_selection_border = 
        //     env.gifwall || context.flags.show_mini_selection_border;

        // Hive.enter();
    };

    o.init_save_dialog = function(){
        // TODO: communicate tags to sandbox
        // canonicalize tags field.
        function tags_input_changed(el) {
            const reserved_tags = ["remixed", "gifwall"];
            var tags = el.val().trim();
            // var tag_list = Hive.tag_list(tags);
            // tags = Hive.canonical_tags(tag_list, reserved_tags);
            $("#tags_input").val(tags);
            // Hive.set_tag_index(Hive.tag_list(tags));
            var search_tags = " " + tags.toLowerCase() + " ";
            $(".remix_label input").prop("checked", search_tags.indexOf(" #remix ") >= 0);
        }
        $("#tags_input").change(function(e){
            var el = $(e.target);
            tags_input_changed(el);
        });
        $(".remix_label input").change(function(e) {
            if ($(e.target).prop("checked")) {
                $("#tags_input").val("#remix " + $("#tags_input").val());
            } else {
                $("#tags_input").val($("#tags_input").val().replace(/[#,]?remix/gi,""));
                tags_input_changed($("#tags_input"));
            }
        });
        tags_input_changed($("#tags_input"));
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
        if(expr.auth) $('#menu_privacy [val=' + Hive.Exp.auth +']').click();
    }

    return o
});
