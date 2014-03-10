
//var photosCollection = Alloy.Collections.Photos;

function publishExrpession(){
	var apps = new Array();
	photosCollection.each(function(p, index) {
		var w= p.get('width');
		var h = p.get('height');
		var n_y = h*index;
		apps.push({
			"file_id": p.get('new_hive_id'),
			"z": index,
			"dimensions": [w, h],
			"position":[0,n_y],
			"type": "hive.image"
		});
	});

	var exp = {
		"tags": $.tf_tags.value,
		"name": $.tf_url.value,
		"auth": "public",
		"title": $.tf_title.value,
		"apps": apps
	};

	Ti.API.info("here is your exp json: "+ JSON.stringify(exp));

	//Prepare xhr request
	var BASE_URL = Titanium.App.Properties.getString('base_url_ssl');
	var url = BASE_URL + 'api/expr/save';
	var xhr = Ti.Network.createHTTPClient();

	xhr.onload = function(){
		try {
		    JSON.parse(this.responseText);
		} catch(error) {
			alert('upload failed.');

			return;
		}
		
		res = JSON.parse(this.responseText);
		Ti.API.info("the res: "+ this.responseText);

		//remove all the photo models from the collection to start the next expression fresh
		photosCollection.reset();

		var creator = Alloy.createController('Create'); 
		creator.getView('create_window').open();

		var BASE_URL_COMMON = Titanium.App.Properties.getString('base_url');
		var viewingURL = BASE_URL_COMMON + Ti.App.current_user_name + '/' + res.name;
		Ti.Platform.openURL(viewingURL);
	};
	
	if(Titanium.App.Properties.getBool('is_test') == true){
		xhr.validatesSecureCertificate = false;
	}

	xhr.open('POST', url);
	
	xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded')
	xhr.setRequestHeader("Accepts","application/json");
	
	var params = {client : 'mobile', json: 'true', expr: JSON.stringify(exp)};
	xhr.send(params);
}

$.image_back.addEventListener('click', function(){
	var comp = Alloy.createController('Compose'); 
	comp.getView('compose_window').open();
});

$.btn_save.addEventListener('click', function() {
	var title = $.tf_title.value;
	var url = $.tf_url.value;
	var tags = $.tf_tags.value;

	if(title == ""){
		alert("Please provide a title for your new expression.");
		return;
	}

	if(url == ""){
		url = title.replace(/[^0-9a-zA-Z]/g, "-").replace(/--+/g, "-").replace(/-$/, "").toLowerCase();
		alert(url);
	}

	publishExrpession();
});

$.tf_title.addEventListener('change',function() {
	var title =  $.tf_title.value;
	url = title.replace(/[^0-9a-zA-Z]/g, "-").replace(/--+/g, "-").replace(/-$/, "").toLowerCase();
	$.tf_url.value = url;
});

$.save_window.addEventListener('click', function()  {
	$.tf_title.blur();
	$.tf_url.blur();
	$.tf_tags.blur();
});

$.save_window.addEventListener('focus', function(){
	$.tf_title.focus();
});

$.tf_title.addEventListener('click',function(e){
	e.cancelBubble = true;
});

$.tf_url.addEventListener('click',function(e){
	e.cancelBubble = true;
});

$.tf_tags.addEventListener('click',function(e){
	e.cancelBubble = true;
});

