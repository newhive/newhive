
function doSubmit(e) {
	var BASE_URL = Titanium.App.Properties.getString('base_url_ssl');
	var url = BASE_URL + 'api/user/password_email';
	var xhr = Ti.Network.createHTTPClient();
	var email = $.textfield_email.value;
	
	Ti.API.info('email value: ' + email);
	Ti.API.info('request headers'+ xhr.getUsername());
		
	xhr.open('POST', url);
	
	var params = {email : email, client : 'mobile', json: 'true'};
	Ti.API.info('send them params: '+ url);
	xhr.send(params);

	xhr.onerror = function(e){
		alert(e.error);
	};

	xhr.onload = function(){
		Ti.API.info(this.responseText);
		//if NOT json do nothing
		try {
		    JSON.parse(this.responseText);
		} catch(error) {
			return;
		}
		
		res = JSON.parse(this.responseText);

		if(res.error){
			Ti.API.info('this is error: '+ res.error);
			$.fail.setText(res.error);
			$.fail_view.opacity = 1;
		} else {
			$.success_view.opacity = 1;
		}
	};
}

$.submit.addEventListener('click', function(e){
	$.success_view.opacity = 0;
	$.fail_view.opacity = 0;

	$.fail.setText('');

	doSubmit(e);
});


$.retrieve_password_window.addEventListener('click', function()  {
	$.textfield_email.blur();
});

$.retrieve_password_window.addEventListener('focus', function(){
	$.textfield_email.focus();
});

$.textfield_email.addEventListener('click',function(e){
	e.cancelBubble = true;
});

$.close.addEventListener('click',function(){
	$.success_view.opacity = 0;
	$.fail_view.opacity = 0;

	var login = Alloy.createController('Login');
	login.getView('login_window').open();
});


