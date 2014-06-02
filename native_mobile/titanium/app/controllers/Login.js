var args = arguments[0] || {};
///
Ti.API.info('LOADING LOGIN PAGE');

Ti.App.addEventListener('app:do_login', function(e) {
	do_login();
});

function do_login(e) {
	var BASE_URL = Titanium.App.Properties.getString('base_url_ssl');
	var url = BASE_URL + 'api/user/login?json=true';
	var xhr = Ti.Network.createHTTPClient();
	var username = $.tf_username.value;
	var pwd = $.tf_password.value;
	
	Ti.API.info('username value: ' + username);
	
	if(Titanium.App.Properties.getBool('is_test') && username == ''){
		username = Titanium.App.Properties.getString('username')
		pwd = Titanium.App.Properties.getString('pwd');
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
			
			$.tf_username.blur();
			$.tf_password.blur();
			
			Ti.App.current_user_name = res.name;
			Ti.App.current_user_id = res.id;
			
			var creator = Alloy.createController('Compose'); 
			creator.getView('compose_window').open();
			
		}else{
			Ti.API.info('you failed');
			$.error_message.opacity = 1;
			$.retrieve_password.opacity = 1;
		};
	};

	xhr.onerror = function(e) {
		alert('Error: '+ e.error);
	};
	
}

init_page($.login_window)
init_textfields([$.tf_username, $.tf_password], do_login)

$.tf_username.addEventListener('focus', function(){
	$.error_message.opacity = "0";
	$.retrieve_password.opacity = "0";
});

$.retrieve_password.addEventListener('click', function(){
	var retrieve = Alloy.createController('RetrievePassword'); 
	retrieve.getView('retrieve_password_window').open();
	
	$.error_message.opacity = "0";
	$.retrieve_password.opacity = "0";
	
	$.tf_username.value = "";
	$.tf_password.value = "";
});
