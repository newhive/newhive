define([
     './expr'
    ,'./home'
    ,'./edit_expr'
    ,'./profile'
    ,'./admin'
    ,'./manage_tags'
    ,'./new_account'
    ,'./test_dialogs'
], function(
     expr
    ,home
    ,edit_expr
    ,profile
    ,admin
    ,manage_tags
    ,new_account
    ,test_dialogs
){ 
	return {
    	 expr: expr
        ,home: profile
        ,profile: profile
        ,profile_private: profile
        ,mini: profile
        ,grid: profile
        ,edit_expr: edit_expr
        ,create_expr: edit_expr
        ,admin: admin
        ,test_dialogs: test_dialogs
        ,manage_tags: manage_tags
        ,new_account: new_account
	}
});
