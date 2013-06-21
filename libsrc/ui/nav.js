define([
    'browser/jquery', 
    'browser/layout', 
    'server/context',
    'ui/menu', 
    'ui/dialog',
    'ui/util', 
    'require', 
    'sj!templates/nav.html',
    'sj!templates/login_form.html', 
], function(
	$, lay, context, menu, dialog, ui, require, nav_template
) {
    // Is the nav currently in expr mode?
    var nav_expr_mode = false;
    function render(){
        $('#nav').empty().html(nav_template({
            'expr_view': nav_expr_mode,
            'nav_view': !nav_expr_mode
        }));
        
        $('#logout_btn').click(logout);
        if(!context.user.logged_in) menu('#login_btn', '#login_menu');

        if (!nav_expr_mode) {
            menu('#network_btn', '#network_menu');
            menu('#hive_btn', '#hive_menu');   
        }

        $('#login_form').submit(login);
        if(!context.user.logged_in){
        	var m = menu('#login_btn', '#login_menu', { open: function(){
        		$('#username').focus() } });
        	if(context.error.login) m.open();

        	var d = dialog.create('#dia_login_or_join');
        	$('#sign_up_btn').click(d.open);

        	// request invite form handlers. This form also appears on home page,
        	// so this applies to both, and must be done after the top level render
        	context.after_render.add('.invite_form [name=email]', function(e){
		        e.on('change', function(){
		            $('.invite_form .optional').removeClass('hide');
		        });
		    });
        	context.after_render.add('.invite_form', function(e){
		        e.on('response', function(e, data){
		            if(data){ // success
		                $('.request_invite').hide();
		                $('.request_sent').removeClass('hide');
		                // TODO: set cookie so request_sent can be shown later
		            }
		            else { // failure
		                $('#request_invite .error').removeClass('hide');
		            }
		        });
		    });
        }

        setTimeout(layout, 100);
        $(window).resize(layout);
    }

    function layout(){
    	lay.center($('#nav .center'), $('#nav'));
    }

    function login(){
    	var f = $(this);
    	var json_flag = f.find('[name=json]');

	    if(location.protocol == 'https:'){
	    	$.post(f.attr('action'), f.serialize(), function(user){
	    		if(user){
		    		context.user = user;
					render();
		    		require(['ui/controller'], function(ctrl){ ctrl.refresh() });
		    	}
		    	else $('.login.error').removeClass('hide');
	    	});
            return false;
	    }
    	// can't post between protocols, so pass credentials to site-wide auth
	    else{
	    	var here = window.location;
	    	f.attr('action', context.secure_server + here.pathname.slice(1) + here.search);
	    	f.off('submit'); // prevent loop
	    }
    }
    function logout(){
    	$.post('/api/user/logout', '', function(){
    		context.user.logged_in = false;
    		render();
    		require(['ui/controller'], function(ctrl){ ctrl.refresh(); });
    	});
    }
    
    function set_inverted(invert){
        if (invert) {
            $('#nav').css('bottom',0);
        }
        else {
            $('#nav').css('bottom','');
        }
    }
    
    // If true, the navbar is in expression view mode.
    // Calls render if the new mode is different.
    function set_expr_view(_expr_view) {
        if (Boolean(_expr_view) != nav_expr_mode) {
            nav_expr_mode = Boolean(_expr_view);
            render();
        }
    }

    return { 
        render: render,
        layout: layout,
        set_inverted: set_inverted,
        set_expr_view: set_expr_view
    };
});

// TODO: put these somewhere
(function(){

	// works as handler or function modifier
	function require_login(label, fn) {
	    if (typeof(fn) == "undefined" && typeof(label) == "function"){
	        fn = label;
	        label = undefined;
	    }
	    var check = function() {
	        if(logged_in) {
	            if(fn) return fn.apply(null, arguments);
	            else return;
	        }
	        showDialog('#dia_must_login');
	        $('#dia_must_login [name=initiating_action]').val(label);
	        _gaq.push(['_trackEvent', 'signup', 'open_dialog', label]);
	        return false;
	    }
	    if(fn) return check;
	    else return check();
	}

	function relogin(success){
	    var dia = $('#dia_relogin');
	    showDialog(dia);
	    var form = dia.find('form');
	    var callback = function(data){
	        if (data.login) { 
	            dia.find('.btn_dialog_close').click();
	            success();
	        } else { failure(); };
	    }
	    form.find("[type=submit]").click(function(){
	        return asyncSubmit(form, callback, {dataType: 'json'});
	    });
	};

	var context_to_string = function(opt_arg){
	    var opts = {'plural': true};
	    $.extend(opts, opt_arg);
	    var rv = "";
	    var tag = (urlParams.tag? urlParams.tag.toLowerCase(): '')
	    if (typeof(urlParams) == "object") {
	        if (tag == 'recent' || tag == 'featured'){
	            rv += tag + " expression" + (opts.plural? "s": "" );
	        } else if (urlParams.user) {
	            if (opts.plural){
	                rv += urlParams.user + "'s expressions";
	            } else {
	                rv += "expression by " + urlParams.user;
	            }
	        } else {
	            rv += (opts.plural? "all expressions": "expression");
	        }
	        if (tag){
	            if (!(tag == "recent" || tag == "featured")) {
	                rv += " tagged " + tag;
	            }
	        }
	        return rv;
	    }
	};

	// TODO: put these two somewhere in server?
	function logAction(action, data){
	    if (!data) data=false;
	    $.ajax({
	        url: '', 
	        type: 'POST',
	        data: {action: 'log', log_action: action, data: JSON.stringify(data)}
	    });
	};
	function logShare(service){
	    var data = {'service': service};
	    if (typeof(expr_id) != 'undefined') data.expr_id = expr_id
	    logAction('share', data);
	    _gaq.push(['_trackEvent', 'share', service]);
	};
});
