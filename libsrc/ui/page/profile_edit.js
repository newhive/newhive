define([
    'browser/jquery',
    'sj!templates/profile_edit.html',

    'ui/dialog',
    'ui/util',
    'context',
    'sj!templates/cards.html',
    'sj!templates/user_byline.html',
    'sj!templates/lazy_mini_expression.html',

], function(
    $
   ,profile_edit_template

   ,dialog
   ,util
   ,context
   ,cards_template
   ,template_user_byline
   ,template_mini_expr
) {
    var o = { name: 'profile_edit' }
    o.init = function(controller){ o.controller = controller }

    o.attach_handlers = function(){
        $('textarea.about').bind_once('keypress', function(e) {
            // Check the keyCode and if the user pressed Enter (code = 13) 
            // disable it
            if (event.keyCode == 13) {
                event.preventDefault();
            }
        })
    }

    o.render = function(page_data){
        $('#site').empty().append(profile_edit_template(page_data));
        
        $('#thumb_form').on('success',
            on_file_upload('#profile_thumb', '#thumb_id_input'))
        $('#bg_form').on('success',
            on_file_upload('#profile_bg', '#bg_id_input'))
        // Click-through help text to appropriate handler
        $(".help_bar").on("click", function(e) {
            $(this).next().trigger(e); 
        })

        $('#user_update_form button[name=cancel]').click(function(e) {
            o.controller.open('expressions_feed',
                {owner_name: context.user.name });
            return false;
        })
        $('#user_update_form').on('success', function(e, data){
            if(data.error) alert(data.error);
            else {
                o.controller.open('expressions_feed',
                    {owner_name: context.user.name });
            }
        })
    }
    o.exit = function(){
    }

    // on_file_upload returns a handler for server response from a
    //   file form submission
    // data from server is list of dicts representing files just uploaded
    // img src is updated based on data
    // input (hidden) value is set to URL from data
    function on_file_upload(img, input){ return function(e, data){
        if(data.error)
            alert('Sorry, I did not understand that file as an image.' +
            'Please try a jpg, png, or if you absolutely must, gif.');
        var el = $(img), thumb = data[0].thumb_big;
        el.attr('src', thumb ? thumb : data[0].url);
        $(input).val(data[0].id);
    }}

    return o;
});
