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
        home: profile,
        profile: profile,
        profile_private: profile,
        mini: profile,
        grid: profile,
        edit_expr: edit_expr,
        create_expr: edit_expr
	}
});
