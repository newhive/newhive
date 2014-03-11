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



function showHiveCamera() {

	var camera_button = Titanium.UI.createButton({
		right:0,
		bottom:0,
		width:'70%',
		height:'23%',
		backgroundImage: "/images/bg_orange_slice.png",
		backgroundSelectedImage:'/images/bg_grey_slice_inactive.png',
		backgroundRepeat: true,
		color:"#444",
		selectedColor:"#fff",
		font: {fontWeight:'bold',fontSize:'22dp'}
	});
	var cancel_button = Titanium.UI.createButton({
		left:0,
		bottom:0,
		width:'30%',
		height:'23%',
		backgroundImage: "/images/bg_slice_grey_flat.png",
		backgroundSelectedImage:'/images/bg_slice_grey_flat_inactive.png',
		backgroundRepeat: true,
		color:"#444",
		selectedColor:"#fff",
		font: {fontWeight:'bold',fontSize:'22dp'}
	});
	
	
	camera_button.addEventListener('click',function(e)
	{
	   Titanium.API.log('info', 'Click-click!');
	   Titanium.Media.takePicture();
	});
	
	cancel_button.addEventListener('click',function(e)
	{
	   Titanium.API.log('info', 'Cancel!');
	   Titanium.Media.hideCamera();
	});
	
	
	var camera_button_view = Titanium.UI.createView();
	camera_button_view.add(camera_button);
	camera_button_view.add(cancel_button);
	
	var camera_2d_matrix = Titanium.UI.create2DMatrix({scale:1});
	
	Titanium.Media.showCamera({
	
		success:function(event)
		{
			small_image_obj = reduceImageSize(event.media);


			photo = Alloy.createModel('photos');
			photo.set('photo_blob', small_image_obj.image);
			photo.set('width', small_image_obj.width);
			photo.set('height', small_image_obj.height);
			photo.save();
			photosCollection.add(photo);

			var compose = Alloy.createController('Compose'); 
			compose.getView('compose_window').open();
			Titanium.Media.hideCamera();

			uploadImage(photo);
		},
		cancel:function()
		{
			var compose = Alloy.createController('Compose'); 
			compose.getView('compose_window').open();
			Titanium.Media.hideCamera();
		},
		error:function(error)
		{
			// create alert
			var a = Titanium.UI.createAlertDialog({title:'Camera'});
	
			// set message
			if (error.code == Titanium.Media.NO_CAMERA)
			{
				a.setMessage('Please run this test on device');
			}
			else
			{
				a.setMessage('Unexpected error: ' + error.code);
			}
	
			// show alert
			a.show();
		},
		saveToPhotoGallery:false,
		allowEditing:false,
		animated:true,
		showControls:true,
		/*overlay:camera_button_view,*/
		autohide:true,
		transform:camera_2d_matrix,
		mediaTypes:[Ti.Media.MEDIA_TYPE_VIDEO,Ti.Media.MEDIA_TYPE_PHOTO]
	});
}

function showHiveGallery(){
	Titanium.Media.openPhotoGallery({
		success:function(event)
		{
			//checking if it is photo
			if(event.mediaType == Ti.Media.MEDIA_TYPE_PHOTO) {
				small_image_obj = reduceImageSize(event.media);

				photo = Alloy.createModel('photos');
				photo.set('photo_blob', small_image_obj.image);
				photo.set('width', small_image_obj.width);
				photo.set('height', small_image_obj.height);
				photo.save();
				photosCollection.add(photo);

				var compose = Alloy.createController('Compose'); 
				compose.getView('compose_window').open();
				Titanium.Media.hideCamera();

				uploadImage(photo);
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
		Ti.API.info('Check Login Error: '+ e.error);
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


function reduceImageSize(lg_img){
	//first, smallify the image
	var orientation = (lg_img.width > lg_img.height) ? 'landscape' : 'portrait';
	Ti.API.info('ORIENTATION: ' + orientation);
	Ti.API.info('width: ' + lg_img.width);
	Ti.API.info('height: ' + lg_img.height);

	var max_length = 1000;
	var reduce_pct = 0.5;

	if(orientation == 'portrait'){
		reduce_pct = (max_length/lg_img.height);
	}else {
		reduce_pct = (max_length/lg_img.width);
	}

	reduce_w = lg_img.width*reduce_pct;
	reduce_h = lg_img.height*reduce_pct;
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

	xhr.onload = function(){
		//if NOT json redirect to login
		try {
		    JSON.parse(this.responseText);
		} catch(error) {
			alert('upload failed.');

			return;
		}
		
		Ti.API.info("the uploadImage response: "+ this.responseText);
		res = JSON.parse(this.responseText)[0];
		alert("the res id: "+ res.id);
		photo_model.set('new_hive_id', res.id);
		Ti.API.info("the res id: "+ res.id);
		photo_model.save();
	};
	

	if(Titanium.App.Properties.getBool('is_test') == true){
		xhr.validatesSecureCertificate = false;
	}

	xhr.open('POST', url);
	small_photo = photo_model.get('photo_blob');
	var params = {client : 'mobile',  file: small_photo};
	xhr.send(params);
}

