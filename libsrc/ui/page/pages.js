define([
    './expr',
    './edit_expr',
    './profile'
], function(
    expr,
    edit_expr,
    profile
){ 
	return {
    	expr: expr,
        edit_expr: edit_expr,
    	profile: profile
	}
});
