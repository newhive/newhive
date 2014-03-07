$.submit.addEventListener('click', function(e){
	doSubmit(e);
});



function doSubmit(e) {
	var BASE_URL = Titanium.App.Properties.getString('base_url_ssl');
	var url = BASE_URL + 'api/user/password_email';
	var xhr = Ti.Network.createHTTPClient();
	var email = $.textfield_email.value;
	
	Ti.API.info('email value: ' + email);
	Ti.API.info('request headers'+ xhr.getUsername());
	
	xhr.onload = function(){
		Ti.API.info(this.responseText);
		//if NOT json do nothing
		try {
		    JSON.parse(this.responseText);
		} catch(error) {
			return;
		}
		
		res = JSON.parse(this.responseText);
		
	 	/*
		if(res.logged_in){
			Ti.API.info('retrieval success! '+ res);
			//$.retrieve_password_window.close();
		}else{
			Ti.API.info('you failed');
			$.error_message.opacity = 1;
			$.retrieve_password.opacity = 1;
		};
		*/
	};
	
	xhr.open('POST', url);
	
	xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
	xhr.setRequestHeader("Accepts","application/json");
	
	var params = {email : email, client : 'mobile', json: 'true'};
	Ti.API.info('send them params: '+ url);
	xhr.send(params);
}