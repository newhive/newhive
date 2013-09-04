/* 
 * class new_account
   Controls dynamic aspects of new_account page.
 */
define([
    'browser/jquery',
    'server/context',
    'sj!templates/create_account.html'
], function(
    $, context, create_account
) {
    var o = {}, page, field_name;
    
    o.init = function(page){
        o.page = page;
    }
    
    o.render = function(){
        $('#site').empty().append(create_account(context.page_data));
        field_name = $('#create_account input[name=username]');
        field_name.focus().keyup(update_name_url);
        $('#create_account input[name=email]').keyup(check_form);
        $('#create_account input[name=password]').keyup(check_form);
        $('#create_account input[name=agree]').change(check_form);
        check_form();
    }

    function update_name_url() {
        var username = field_name.val();
        if (username.length == 0)
            username = "username";
            // $('#create_account input[name=username]').attr("placeholder");
        $('#username_label').html(username);
        check_form();
    }

    function check_form() {
        if ($('#create_account input[name=username]').val() != "" &&
            $('#create_account input[name=email]').val() != "" &&
            $('#create_account input[name=password]').val() != "" &&
            $('#create_account input[name=agree]').prop('checked'))
            $('#create_account .submit').removeAttr("disabled");
        else
            $('#create_account .submit').attr("disabled", "disabled");
    }

    return o;
});
