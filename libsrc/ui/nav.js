define([
    'browser/jquery', 'server/session', 'ui/menu', 'ui/util',
    'sj!templates/nav.html', 'sj!templates/login_form.html'
], function($, s, menu, ui, nav_template, login_template) {
    function render(server_state){
        $('body').append(nav_template());

        if(!s.user.logged_in) menu('#login_btn', '#login_menu');
        ui.add_hovers();
    }

    return { render: render };
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

	Hive.login_submit = function(form){
	    var form = $(form);
	    var identifier = form.parent().attr('id') || form.parents('.dialog').attr('id');
	    form.find('[name=url]').val(window.location.href);
	    _gaq.push(['_trackEvent', 'login', identifier]);
	};

	Hive.logout_submit = function(that){
	    var form = $(that).parents('form');
	    form.find('[name=url]').val(window.location.href);
	    _gaq.push(['_trackEvent', 'logout', 'complete']);
	    // Delay ensures that event is tracked
	    setTimeout(function(){ form.submit(); }, 800);
	};

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