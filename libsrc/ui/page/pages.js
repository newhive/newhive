define([
     './expr'
    ,'./home'
    ,'./edit_container'
    ,'./profile'
    ,'./admin'
    ,'./new_account'

    ,'../../test/html_global'
    ,'../../test/test_assets'
], function(
     expr
    ,home
    ,edit_container
    ,profile
    ,admin
    ,new_account

    ,html_global
    ,test_assets
){ 
	return {
    	 expr: expr
        ,home: profile
        ,profile: profile
        ,profile_private: profile
        ,mini: profile
        ,grid: profile
        ,cat: profile
        ,edit_container: edit_container
        ,expr_create: edit_container
        ,admin: admin
        ,new_account: new_account

        ,test_dialogs: html_global
        ,test_assets: test_assets
	}


});
