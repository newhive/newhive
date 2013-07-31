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
        edit_expr: edit_expr,
    	profile: profile
	}
});
