/* 
 * class new_account
   Controls dynamic aspects of new_account page.
 */
define([
     'browser/jquery'
    ,'context'
    ,'ui/routing'
    ,'browser/js'
    ,'sj!templates/create_account.html'
], function(
     $
    ,context
    ,routing
    ,js
    ,create_account
) {
    var o = {}, page, field_name;
    
    o.init = function(page){
        o.page = page;
    }

    var old_name;
    var check_name = function(name){
        var set_name_err = function(data){
            $('.name_msg').hidehide();
            $('.name_msg.' + (data ? 'good' : 'error')).showshow();
            $('#create_form .submit').attr("disabled", !data);
        }
        if(!name || old_name == name)
            return;
        if(! name.match(/^[a-z][a-z0-9]{2,23}$/)){
            set_name_err(false);
            return;
        }

        $.get(routing.page_state('name_check', {}).api, {name: name},
            set_name_err);
    };
    
    o.render = function(){
        $('#site').empty().append(create_account(context.page_data));
        if(context.login_form){
            $('#create_form [name=name]').val(context.login_form.username)
            $('#create_form [name=password]').val(context.login_form.secret)
            delete context.login_form
        }
        check_form();
    }

    o.attach_handlers = function(){
        field_name = $('#create_form [name=name]');
        field_name.focus().keyup(update_name);
        $('#create_form [name=email]').keyup(check_form);
        $('#create_form [name=password]').keyup(check_form);
        $('#create_form [name=agree]').change(check_form);

        $('#create_form input').on('change', check_form);
        $('#create_form').on('submit', check_form);
    }

    function update_name() {
        var username = field_name.val();
        if(username.length == 0)
            username = "username";
            // $('#create_form [name=username]').attr("placeholder");
        $('#username_label').html(username);
        check_name(username);
    }

    function check_form() {
        if( $('#create_form [name=email]').val() != "" &&
            $('#create_form [name=password]').val() != "" &&
            $('#create_form [name=agree]').prop('checked')
        ) {
            $('#create_form .submit').attr("disabled", false);
        } else {
            $('#create_form .submit').attr("disabled", true);
            return false;
        }
    }

    return o;
});
