define([
    'browser/jquery',
    'ui/nav',
    'ui/new_account',
    'server/context',
    'browser/layout',
    'ui/util',
    'ui/routing',
    'sj!templates/card_master.html',
    'sj!templates/home.html',
    'sj!templates/social_overlay.html',
    'sj!templates/overlay.html',
    'sj!templates/profile_edit.html',
    'sj!templates/tags_page.html',
    'sj!templates/activity.html',
    'sj!templates/expr_card_large.html',
    'sj!templates/expr_card_feed.html',
    'sj!templates/expr_card_mini.html',
    'sj!templates/feed_card.html',
    'sj!templates/user_card.html',
    'sj!templates/profile_card.html',
    'sj!templates/icon_count.html',
    'sj!templates/tag_card.html',
    'sj!templates/dialog_embed.html',
    'sj!templates/dialog_share.html',
    'sj!templates/request_invite_form.html'
], function(
    $, nav, new_account, context, browser_layout, ui_util, routing,
    master_template, home_template, social_overlay_template, overlay_template,
    profile_edit_template, tags_page_template, activity_template
) {
    var o = {};

    // Animate the new visible expression, bring it to top of z-index.
    // TODO: animate nav bar
    o.expr = function(page_data){
        // TODO: should the HTML render on page load? Or delayed?
        // $("#nav").prependTo("body");
        // TODO: shouldn't empty #nav
        $("#popup_content").remove()
        $('#social_overlay').append(
            social_overlay_template(context.page_data));
        if (1) { // bugdebug. debugging short windows sucks.
            $('#social_overlay').css('height','650px');
            $('#social_overlay #popup_content').css('height','606px');
        }
        var embed_url = 'https://' + window.location.host + window.location.pathname + '?template=embed';
        $('#dia_embed textarea').val("<iframe src='" + embed_url + 
            "' style='width: 100%; height: 100%' marginwidth='0' marginheight='0'" +
            " frameborder='0' vspace='0' hspace='0'></iframe>");
        $("#nav").prependTo("#social_overlay");
        $("#nav #plus").unbind('click');
        $("#nav #plus").click(o.social_toggle);
        $('#comment_form').on('response', o.comment_response);

        // display_expr(page_data.expr_id);
        var expr_id = page_data.expr_id;
        var expr_curr = $('.expr-visible');
        expr_curr.removeClass('expr-visible');
        $('#exprs').show();
        $('#social_plus').show();

        var contentFrame = $('#expr_' + expr_id);
        if (contentFrame.length == 0) {
            // Create new content frame
            var contentFrameURL = contentFrameURLBase + expr_id;
            contentFrame = $('<iframe class="expr expr-visible">');
            contentFrame.attr('src', contentFrameURL);
            contentFrame.attr('id','expr_' + expr_id);
            $('#exprs').append(contentFrame);
        }
        else {
            contentFrame.addClass('expr-visible').removeClass('expr-hidden');
            contentFrame.get(0).contentWindow.
                postMessage({action: 'show'}, '*');
        }
        contentFrame.show();
        if (o.anim_direction == 0 || expr_curr.length != 1) {
            contentFrame.css({
                'left': 0,
                'top': -contentFrame.height() + 'px',
                'z-index': 1 }
            ).animate({
                top: "0"
            }, {
                duration: ANIM_DURATION,
                complete: hide_other_exprs });
        } else {
            // 
            contentFrame.css({
                'top': 0,
                'left': o.anim_direction * contentFrame.width(),
                'z-index': 1 }
            ).animate({
                left: "0"
            }, {
                duration: ANIM_DURATION,
                complete: hide_other_exprs,
                queue: false })
            expr_curr.animate({
                'left': -o.anim_direction * contentFrame.width(),
            }, {
                duration: ANIM_DURATION,
                complete: hide_other_exprs,
                queue: false })
        }
        $('#exprs .expr').not('.expr-visible').css({'z-index': 0 });
    };
});