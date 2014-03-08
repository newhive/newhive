var args = arguments[0] || {};
///
Ti.API.info('LOADING LOGIN PAGE');

function doLogin(e) {
	var BASE_URL = Titanium.App.Properties.getString('base_url_ssl');
	var url = BASE_URL + 'api/user/login?json=true';
	var xhr = Ti.Network.createHTTPClient();
	var username = $.textfieldUsername.value;
	var pwd = $.textfieldPwd.value;
	
	Ti.API.info('username value: ' + username);
	
	if(Titanium.App.Properties.getBool('is_test') && username == ''){
		username = 'viciousesque';
		pwd = 'trueman';
		//alt pwd: mytCailfac6
	}
	
	if(Titanium.App.Properties.getBool('is_test') == true){
		xhr.validatesSecureCertificate = false;
	}

	xhr.open('POST', url);
	
	var params = {username : username, secret : pwd, client : 'mobile', json: 'true'};
	Ti.API.info('send them params: '+ username + ', '+ pwd);
	xhr.send(params);

	xhr.onload = function(){
		Ti.API.info(this.responseText);
		Ti.API.info('this the login response');
		
		//if NOT json do nothing
		try {
		    JSON.parse(this.responseText);
		} catch(error) {
			Ti.API.info('i am login js and this is NOT json');
			return;
		}
		
		res = JSON.parse(this.responseText);
		
	 	
		if(res.logged_in){
			Ti.API.info('login success! '+ res.name);
			
			$.textfieldUsername.blur();
			$.textfieldPwd.blur();
			
			Ti.App.current_user_name = res.name;
			Ti.App.current_user_id = res.id;
			
			var creator = Alloy.createController('Create'); 
			creator.getView('create_window').open();
			
		}else{
			Ti.API.info('you failed');
			$.error_message.opacity = 1;
			$.retrieve_password.opacity = 1;
		};
	};
	
}

$.textfieldUsername.addEventListener('focus', function(){
	$.error_message.opacity = "0";
	$.retrieve_password.opacity = "0";
});


$.retrieve_password.addEventListener('click', function(){
	/*var retrievePasswordController = Alloy.createController('RetrievePassword', {
	    parentTab : args.parentTab
	});
	
	args.parentTab.open(retrievePasswordController.getView());
	
	$.error_message.opacity = "0";
	$.retrieve_password.opacity = "0";
	
	$.textfieldUsername.value = "";
	$.textfieldPwd.value = "";*/
});





