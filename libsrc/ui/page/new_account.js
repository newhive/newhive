/* 
 * class new_account
   Controls dynamic aspects of new_account page.
 */
define([
     'browser/jquery'
    ,'server/context'
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
        if(!name || old_name == name)
            return;
        $.get(routing.page_state('name_check', {}).api, {name: name},
            function(data){
                $('.name_msg').hidehide();
                $('.name_msg.' + (data ? 'good' : 'error')).showshow();
            }
        );
        var input = $('#name_check input');
        if(input.val() == name) return;
        input.val(name);
        $('#name_check').submit();
    };
    
    o.render = function(){
        $('#site').empty().append(create_account(context.page_data));
        check_form();
    }

    o.attach_handlers = function(){
        field_name = $('#create_account input[name=username]');
        field_name.focus().keyup(update_name_url);
        $('#create_account input[name=email]').keyup(check_form);
        $('#create_account input[name=password]').keyup(check_form);
        $('#create_account input[name=agree]').change(check_form);
    }

    function update_name_url() {
        var username = field_name.val();
        if (username.length == 0)
            username = "username";
            // $('#create_account input[name=username]').attr("placeholder");
        $('#username_label').html(username);
        check_form();
        check_name(username);
    }

    function check_form() {
        if( $('#create_account input[name=username]').val() != "" &&
            $('#create_account input[name=email]').val() != "" &&
            $('#create_account input[name=password]').val() != "" &&
            $('#create_account input[name=agree]').prop('checked')
        )
            $('#create_account .submit').removeAttr("disabled");
        else
            $('#create_account .submit').attr("disabled", "disabled");
    }

    return o;
});
