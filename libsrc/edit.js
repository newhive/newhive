define(['mustache!edit/test.html'], function(tmpl){
	function load(expr){
		console.log('loading editor, with test template...', tmpl);

		// u.map(function(module){ module.load() }, modules);
	}

	return {
		load: load
	}

	window.addEventListener('message', function(m){
	    function on_response(ret) {
	        Hive.upload_finish();
	        if(typeof(ret) != 'object')
	            alert("Sorry, something is broken :(. Please send us feedback");
	        if(ret.error == 'overwrite') {
	            $('#expr_name').html(expr.name);
	            showDialog('#dia_overwrite');
	            $('#save_submit').removeClass('disabled');
	        }
	        else if(ret.location) {
	            //Hive.del_draft();
	            window.location = ret.location;
	        }
	    }

	    var on_error = function(ret) {
	        Hive.upload_finish();
	        if (ret.status == 403){
	            relogin(function(){ $('#btn_save').click(); });
	        }
	        $('#save_submit').removeClass('disabled');
	    }
	    console.log(m);
	    $.ajax({
	        type : "POST",
	        dataType : 'json',
	        data : { action : 'expr_save', exp : JSON.stringify(Hive.state()) },
	        success : on_response,
	        error: on_error
	    });
	}, false);

})