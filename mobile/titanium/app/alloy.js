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

Titanium.App.Properties.setBool('is_test', true);
Titanium.App.Properties.setString('username', 'nd4');
Titanium.App.Properties.setString('pwd', 'nd4');

var photosCollection = Alloy.Collections.instance('Photos');


Titanium.App.Properties.setString('base_url_ssl', 'https://www.newhive.com/');
Titanium.App.Properties.setString('base_url', 'http://www.newhive.com/');

Titanium.App.Properties.setInt('num_active_xhr', 0);
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
	top:"0dp",
	right:"0dp",
	height:"40dp",
	width:"40dp",
	backgroundColor:"#ffffff",
	opacity:0.95,
	zIndex:100
});
Titanium.App.Properties.setBool('activity_indicator_is_visible', false);


function showHiveCamera() {
	Titanium.Media.showCamera({
		success:function(event)
		{
			compose_win.open();	
			Titanium.Media.hideCamera();

			small_image_obj = reduceImageSize(event.media);

			photo_model = Alloy.createModel('photos');
			photo_model.set('photo_blob', small_image_obj.image);
			photo_model.set('width', small_image_obj.width);
			photo_model.set('height', small_image_obj.height);
			photo_model.set('is_uploaded', 0);
			photo_model.save();
			photosCollection.add(photo_model);

			Ti.App.fireEvent('enableShowCamera');
			Titanium.App.Properties.setBool('is_camera_open', false);

			uploadImage(photo_model);
		},
		cancel:function()
		{
			Ti.App.fireEvent('enableShowCamera');
			Ti.App.fireEvent('enableSave');

			Titanium.App.Properties.setBool('is_camera_open', false);

			//caputre any setActivityIndicatorHide events that were defered because the camera was open
			if(Titanium.App.Properties.getInt('num_active_xhr') ==0){
				setActivityIndicatorHide();
			}
		},
		error:function(error)
		{
			alert('camera error.');
			Ti.App.fireEvent('enableShowCamera');
			Ti.App.fireEvent('enableSave');
		},
		saveToPhotoGallery:false,
		allowEditing:false,
		animated:true,
		showControls:true,
		autohide:false,
		mediaTypes:[Ti.Media.MEDIA_TYPE_PHOTO]
	});

	var compose = Alloy.createController('Compose'); 
	var compose_win = compose.getView('compose_window');
	Ti.App.fireEvent('showSave');
	//avoid camera error by disabling showCamera on compose page until image finishes resizing
	Ti.App.fireEvent('disableShowCamera');
	Titanium.App.Properties.setBool('is_camera_open', true);	
}

function showHiveGallery(){
	var opts = {
		mediaTypes:[Titanium.Media.MEDIA_TYPE_PHOTO],
		success:function(event)
		{
			var small_image_obj;
			// checking if it is photo
			if(event.mediaType == Ti.Media.MEDIA_TYPE_PHOTO) {
				small_image_obj = reduceImageSize(event.media);
			}

			if (small_image_obj && small_image_obj.width) {
				compose_win.open();
				var photo_model = Alloy.createModel('photos');
				photo_model.set('photo_blob', small_image_obj.image);
				photo_model.set('width', small_image_obj.width);
				photo_model.set('height', small_image_obj.height);
				photo_model.save();
				photosCollection.add(photo_model);

				Ti.App.fireEvent('enableShowCamera');

				uploadImage(photo_model);
			}   else {
				alert('Sorry, only image uploads allowed at this time.');
			}
		},
		cancel:function() {
			Ti.App.fireEvent('enableShowCamera');
			Ti.App.fireEvent('enableSave');

			Titanium.App.Properties.setBool('is_camera_open', false);

			//caputre any setActivityIndicatorHide events that were defered because the camera was open
			if(Titanium.App.Properties.getInt('num_active_xhr') ==0){
				setActivityIndicatorHide();
			}
		}	
	};
	Titanium.Media.openPhotoGallery(opts);

	var compose = Alloy.createController('Compose'); 
	var compose_win = compose.getView('compose_window');
	Ti.App.fireEvent('showSave');
	//avoid camera error by disabling showCamera on compose page until image finishes resizing
	Ti.App.fireEvent('disableShowCamera');
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
		checkLogin();
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

			var creator = Alloy.createController('Compose'); 
			creator.getView('compose_window').open();
		}else{
			var login = Alloy.createController('Login');
			login.getView('login_window').open();
			login.tf_username.softKeyboardOnFocus =
				Titanium.UI.Android.SOFT_KEYBOARD_SHOW_ON_FOCUS;
			login.tf_username.focus();
		};
	};
}

function reduceImageSize(lg_img) {
	var max_length = 1000;

	reduce_pct = max_length/lg_img.width;

	reduce_w = Math.floor(lg_img.width*reduce_pct);
	reduce_h = Math.floor(lg_img.height*reduce_pct);


	Ti.API.info('New Reduce Width: ' + reduce_w);
	Ti.API.info('New Reduce Height: ' + reduce_h);
	try {
		Ti.API.info('BEFORE reducing: ' + lg_img.length);
	} catch(error) {}

	small_photo = ImageFactory.imageAsResized(lg_img,
		{
			width:reduce_w,
			height:reduce_h,
			format:ImageFactory.JPEG
		});

	try {
		small_photo = ImageFactory.compress(small_photo, 0.555);
	} catch(error) {
		Ti.API.info('Input not compressible: ');
		return false;
	}

	Ti.API.info('AFTER reducing: ' + small_photo.length);
	Ti.API.info('AFTER width: ' + reduce_w);
	Ti.API.info('AFTER height: ' + reduce_h);

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

	naxhr = Titanium.App.Properties.getInt('num_active_xhr');
	naxhr++;
	Titanium.App.Properties.setInt('num_active_xhr', naxhr);

	setActivityIndicatorShow();

	xhr.onerror = function(e) {
		naxhr = Titanium.App.Properties.getInt('num_active_xhr');
		naxhr--;
		Titanium.App.Properties.setInt('num_active_xhr', naxhr);

		if(naxhr == 0 && Titanium.App.Properties.getBool('is_camera_open')==false){
			setActivityIndicatorHide();
		}
		Ti.App.fireEvent('photoFailedToUpload');
	};

	xhr.onload = function(){

		//if NOT json redirect to login
		try {
		    JSON.parse(this.responseText);
		} catch(error) {
			alert('upload failed.');

			return;
		}

		naxhr = Titanium.App.Properties.getInt('num_active_xhr');
		naxhr--;
		Titanium.App.Properties.setInt('num_active_xhr', naxhr);

		//if camera is open defer setActivityIndicatorHide
		if(naxhr == 0 && Titanium.App.Properties.getBool('is_camera_open')==false){
			setActivityIndicatorHide();
		}

		res = JSON.parse(this.responseText)[0];

		photo_model.set('new_hive_id', res.id);
		photo_model.set('is_uploaded', 1);
		photo_model.save();

		//used to update image view in compose
		Ti.App.fireEvent('photoUploaded');

		//check for and if any retry faild uploads
		Ti.App.fireEvent('retryFailedUploads');
	};
}

Ti.App.addEventListener('retryFailedUploads',function() {
	fu = photosCollection.where({is_uploaded: 0});
	Ti.API.info('retryFailedUploads');
	try{
		if(fu.length > 0){
			photo_model = fu.pop();
			uploadImage(photo_model);
		}
	} catch(error){
		return;
	}
});


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

function setActivityIndicatorShow(){
	activityIndicator.show();
	Titanium.App.Properties.setBool('activity_indicator_is_visible', true);
	Ti.App.fireEvent('disableSave');
}
function setActivityIndicatorHide(){
	activityIndicator.hide();
	Titanium.App.Properties.setBool('activity_indicator_is_visible', false);
	Ti.App.fireEvent('enableSave');
}

Ti.App.addEventListener('clearPhotosDB', function(){
	photosCollection.fetch();
	photosCollection.reset();
	var db=Ti.Database.open('newhive');
	var deleteRecords=db.execute('DELETE FROM photos');
	db.close();
});

var _text_fields
var init_textfields = function(fields, final_callback){
	_text_fields = fields

	// set up tab order
	fields.slice(0,-1).map(function(field, i){
		field.addEventListener('return', function(){
		    fields[i+1].focus() })
	})
	fields[fields.length-1].addEventListener('return', final_callback)

	// default interactive styling
	fields.map(function(field){
		field.addEventListener('focus', function(e){
			e.source.borderColor = '#ACEFE2' })
		field.addEventListener('blur', function(e){
			e.source.borderColor = 'black' })
	})
}
var textfield_blur = function(){
	_text_fields.map(function(f){
		f.blur() }) }

var init_page = function(page){
	page.addEventListener('focus', function(ev){
		addActivityIndicator(ev.source) })

	page.addEventListener('click', function(ev){
		ev_elem = ev.source.getApiName();
		is_textfield = (ev_elem.indexOf('TextField') != -1) ? true : false;

		if(is_textfield) return

		textfield_blur()
	})
}
