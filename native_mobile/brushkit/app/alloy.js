// The contents of this file will be executed before any of
// your view controllers are ever executed, including the index.
// You have access to all functionality on the `Alloy` namespace.
//
// This is a great place to do any initialization for your app
// or create any global variables/functions that you'd like to
// make available throughout your app. You can easily make things
// accessible globally by attaching them to the `Alloy.Globals`
// object. For example:
//
// Alloy.Globals.someGlobalFunction = function(){};

//instantiate the image factory module
var ImageFactory = require('ti.imagefactory');

Titanium.App.Properties.setBool('is_test', true);

var photosCollection = Alloy.Collections.instance('Photos');

//192.168.1.147:5000
//dev-1 login: viciousesque/changeme	
// /var/log/apache2/error.log

Titanium.App.Properties.setString('base_url_ssl', 'https://dev.newhive.com/');
Titanium.App.Properties.setString('base_url', 'http://dev.newhive.com/');

var NUM_ACTIVE_XHR = 0;
var imageUploadQueue = new Array();

//global activityIndicator
var ai_style;
if (Ti.Platform.name === 'iPhone OS'){
	ai_style = Ti.UI.iPhone.ActivityIndicatorStyle.DARK;
}
else {
	ai_style = Ti.UI.ActivityIndicatorStyle.DARK;
}
var activityIndicator = Ti.UI.createActivityIndicator({
	id:'activity_indicator',
	color: '#606060',
	font: {fontSize:"20dp"},
	message: '',
	style:ai_style,
	top:"15%",
	height:"34dp",
	width:"150dp",
	backgroundColor:"#ffffff",
	opacity:0.7,
	zIndex:100
});
Titanium.App.Properties.setBool('activity_indicator_is_visible', false);

function showHiveCamera() {
	Titanium.Media.showCamera({
	
		success:function(event)
		{
			var compose = Alloy.createController('Compose'); 
			var compose_win = compose.getView('compose_window');

			compose_win.open();

			Titanium.Media.hideCamera();

			small_image_obj = reduceImageSize(event.media);

			photo_model = Alloy.createModel('photos');
			photo_model.set('photo_blob', small_image_obj.image);
			photo_model.set('width', small_image_obj.width);
			photo_model.set('height', small_image_obj.height);
			photo_model.save();
			photosCollection.add(photo_model);

			uploadImage(photo_model);
		},
		cancel:function()
		{
			var compose = Alloy.createController('Compose'); 
			compose.getView('compose_window').open();
			Titanium.Media.hideCamera();
		},
		error:function(error)
		{
			alert('camera error.');
		},
		saveToPhotoGallery:false,
		allowEditing:false,
		animated:true,
		showControls:true,
		autohide:false,
		mediaTypes:[Ti.Media.MEDIA_TYPE_PHOTO]
	});
}

function showHiveGallery(){
	Titanium.Media.openPhotoGallery({
		success:function(event)
		{
			//checking if it is photo
			if(event.mediaType == Ti.Media.MEDIA_TYPE_PHOTO) {

				var compose = Alloy.createController('Compose'); 
				var compose_win = compose.getView('compose_window');

				compose_win.open();

				Titanium.Media.hidePhotoGallery();

				small_image_obj = reduceImageSize(event.media);

				photo_model = Alloy.createModel('photos');
				photo_model.set('photo_blob', small_image_obj.image);
				photo_model.set('width', small_image_obj.width);
				photo_model.set('height', small_image_obj.height);
				photo_model.save();
				photosCollection.add(photo_model);

				uploadImage(photo_model);
			}   else {
				alert('Sorry, only image uploads allowed at this time.');
			}
		},
		cancel:function() {
			//user cancelled the action fron within
			//the photo gallery
		}
	});
}

function checkLogin() {
	var BASE_URL = Titanium.App.Properties.getString('base_url_ssl');
	var url = BASE_URL + 'api/user/login';
	var xhr = Ti.Network.createHTTPClient();
	
	if(Titanium.App.Properties.getBool('is_test') == true){
		xhr.validatesSecureCertificate = false;
	}

	xhr.open('POST', url);

	var params = {client : 'mobile', json: 'true'};
	xhr.send(params);

	xhr.onerror = function(e) {
		alert('Error: '+ e.error);
	};

	xhr.onload = function(){
		Ti.API.info("checkLogin New Hive response: "+ this.responseText);
		
		//if NOT json redirect to login
		try {
		    JSON.parse(this.responseText);
		} catch(error) {
		    var login = Alloy.createController('Login');
		    login.getView('login_window').open();
		    return;
		}
		
		res = JSON.parse(this.responseText);
	 	
		if(res.logged_in){
			
			Ti.API.info('login success! '+ res.name);
			 
			Ti.App.current_user_name = res.name;
			Ti.App.current_user_id = res.id;

			var creator = Alloy.createController('Create'); 
			creator.getView('create_window').open();
		}else{
			var login = Alloy.createController('Login');
			login.getView('login_window').open();
		};
	};
}


function reduceImageSize(lg_img) {
	Ti.API.info('width: ' + lg_img.width);
	Ti.API.info('height: ' + lg_img.height);

	var max_length = 1000;

	reduce_pct = max_length/lg_img.width;

	Ti.API.info('this is the REDUCE_PCT: '+ reduce_pct);

	reduce_w = Math.floor(lg_img.width*reduce_pct);
	reduce_h = Math.floor(lg_img.height*reduce_pct);


	Ti.API.info('New Reduce Width: ' + reduce_w);
	Ti.API.info('New Reduce Height: ' + reduce_h);
	Ti.API.info('BEFORE reducing: ' + lg_img.length);


	small_photo = ImageFactory.imageAsResized(lg_img,
		{
			width:reduce_w,
			height:reduce_h,
			format:ImageFactory.JPEG,
			quality:0.8
		});
	Ti.API.info('AFTER reducing: ' + small_photo.length);

	small_photo_obj = {
		image: small_photo,
		width: reduce_w,
		height: reduce_h
	}

	return small_photo_obj;
}

function uploadImage(photo_model) {
	//Prepare xhr request
	var BASE_URL = Titanium.App.Properties.getString('base_url_ssl');
	var url = BASE_URL + 'api/file/create';
	var xhr = Ti.Network.createHTTPClient();

	if(Titanium.App.Properties.getBool('is_test') == true){
		xhr.validatesSecureCertificate = false;
	}

	xhr.open('POST', url);
	small_photo = photo_model.get('photo_blob');
	var params = {client : 'mobile',  file: small_photo};
	xhr.send(params);

	NUM_ACTIVE_XHR++;

	activityIndicator.message = 'uploading ' + NUM_ACTIVE_XHR;
	activityIndicator.show();
	Titanium.App.Properties.setBool('activity_indicator_is_visible', true);

	xhr.onerror = function(e) {
		alert('Error: '+ e.error);
	};

	xhr.onload = function(){
		//if NOT json redirect to login
		try {
		    JSON.parse(this.responseText);
		} catch(error) {
			alert('upload failed.');

			return;
		}

		NUM_ACTIVE_XHR--;

		activityIndicator.message = 'uploading ' + NUM_ACTIVE_XHR ;

		if(NUM_ACTIVE_XHR == 0){
			activityIndicator.hide();
			Titanium.App.Properties.setBool('activity_indicator_is_visible', false);
		}

		res = JSON.parse(this.responseText)[0];

		photo_model.set('new_hive_id', res.id);
		photo_model.save();
	};
}

function addActivityIndicator(win){
	do_add_ai = true;
	//don't add if ActivityIndicator already a child of this window
	wc = win.getChildren();
	for(var i=0;i<wc.length;i++){
		c = wc[i];
		if(c.id == 'activity_indicator'){
			do_add_ai = false;
			return;
		}
	}
	if(do_add_ai){
		win.add(activityIndicator);
	}
};


