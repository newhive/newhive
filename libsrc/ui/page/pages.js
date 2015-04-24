define([
    './expr'
   ,'./edit_container'
   ,'./profile'
   ,'./profile_edit'
   ,'./admin'
   ,'./new_account'
   ,'./test/html_global'
   ,'./test/test_assets'
], function(
    expr
   ,edit_container
   ,profile
   ,profile_edit
   ,admin
   ,new_account
   ,html_global
   ,test_assets
){ return {
    expr:expr
   ,edit_container:edit_container
   ,home:profile
   ,profile:profile
   ,profile_private:profile
   ,mini:profile
   ,grid:profile
   ,cat:profile
   ,profile_edit:profile_edit
   ,admin:admin
   ,new_account:new_account
   ,test_dialogs:html_global
   ,test_assets:test_assets
} });
