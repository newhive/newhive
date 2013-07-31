define([
    './expr',
    './home',
    './edit_expr',
    './profile'
], function(
    expr,
    home,
    edit_expr,
    profile
){ 
	return {
    	expr: expr,
        home: home,
        profile: profile,
        profile_private: profile,
        mini: profile,
        grid: profile,
        edit_expr: edit_expr
	}
});
