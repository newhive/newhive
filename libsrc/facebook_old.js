Hive.Menus = (function(){
    o.init = function(group){
        if(logged_in) {
            $('#hive_menu .email_invites').click(function(){ showDialog('#dia_referral') });

            $('#fb_invite_menu_item').click(function(e){
                _gaq.push(['_trackEvent', 'fb_connect', 'open_invite_dialog', 'user_menu']);
                sendRequestViaMultiFriendSelector();
            });
            $('#fb_connect_menu_item').click(function(e){
                _gaq.push(['_trackEvent', 'fb_connect', 'open_connect_dialog', 'user_menu']);
                showDialog('#dia_facebook_connect');
            });
            $('#fb_listen_menu_item').click(function(e){
                _gaq.push(['_trackEvent', 'fb_connect', 'open_listen_dialog', 'user_menu']);
                e.stopPropagation();
                $(this).addClass('menu_hover');
                loadDialogPost('facebook_listen');
            });
        }
    };
})();

var sendRequestViaMultiFriendSelector = function(){
  function requestCallback(response) {
    $('#dia_referral .btn_dialog_close').click();
    if (response){
      _gaq.push(['_trackEvent', 'fb_connect', 'invite_friends', undefined, response.to.length]);
      showDialog('#dia_sent_invites_thanks');
      $.post('/', {'action': 'facebook_invite', 'request_id': response.request, 'to': response.to.join(',')});
    }
  }
  FB.ui({method: 'apprequests'
    , message: 'Join me on NewHive'
    , title: 'Invite Friends to Join NewHive'
    , filters: ['app_non_users']
  }, requestCallback);
};
