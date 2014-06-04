// to run this:
// curl(["test/html_global"],function(){})
define([
    'sj!templates/activity.html'
    ,'sj!templates/card_master.html'
    ,'sj!templates/cards.html'
    ,'sj!templates/collections.html'
    ,'sj!templates/color_picker.html'
    ,'sj!templates/comment.html'
    ,'sj!templates/create_account.html'
    ,'sj!templates/dialog_embed.html'
    ,'sj!templates/dialog_share.html'
    ,'sj!templates/edit_btn.html'
    ,'sj!templates/expr_actions.html'
    ,'sj!templates/expr_card_feed.html'
    ,'sj!templates/expr_card_large.html'
    ,'sj!templates/expr_card_mini.html'
    ,'sj!templates/feed_card.html'
    ,'sj!templates/form_overlay.html'
    ,'sj!templates/home.html'
    ,'sj!templates/icon_count.html'
    ,'sj!templates/login_form.html'
    ,'sj!templates/manage_tags.html'
    ,'sj!templates/mini_expr.html'
    ,'sj!templates/network_nav.html'
    ,'sj!templates/overlay.html'
    ,'sj!templates/password_reset.html'
    ,'sj!templates/profile_card.html'
    ,'sj!templates/profile_edit.html'
    ,'sj!templates/request_invite_form.html'
    ,'sj!templates/settings.html'
    ,'sj!templates/site_flags.html'
    ,'sj!templates/social_overlay.html'
    ,'sj!templates/tag_card.html'
    ,'sj!templates/tag_list.html'
    ,'sj!templates/tags_main.html'
    ,'sj!templates/tags_page.html'
    ,'sj!templates/user_actions.html'
    ,'sj!templates/user_activity.html'
    ,'sj!templates/user_card.html'
    ,'sj!templates/edit_sandbox.html'
    ,'sj!templates/edit_container.html'
], function(){
    o = {}
    
    var all_divs = $("<div>")
    for (var i = 0; i < arguments.length; ++i) {
        var template = arguments[i]
        all_divs.append(template())
    }
    
    o.render = function(){
        $("body").empty().append(all_divs.find(".dialog").css({
            margin: '15px'
            , display: 'inline-block'
            , position: 'static'
            , "float": 'left'
        }).showshow())
        .add("html").css("background-color", "rgb(84, 113, 175)")
    };

    return o;
});

