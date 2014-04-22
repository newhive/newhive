var photosCollection = Alloy.Collections.instance('Photos');


function dofilter(_collection) {
	//return _collection.where();
}

function doTransform(model) {
	var attrs = model.toJSON();
	if (attrs.is_uploaded == 1) {
			attrs.img_opacity = 1
	} else {
		attrs.img_opacity = 0.5
	}
	return attrs;
}

function showDeleteMediaModal(row){
	mw = Ti.UI.createView({
		id:'delete_media_modal',
		width:"70%",
		height:"30%",
		top:"40dp",
		left:"15%",
		layout:"composite",
		backgroundColor:"#ffffff",
		borderRadius:"10dp",
		zIndex:100
	});
	lbl = Ti.UI.createLabel({
		top:"4dp",
		left:"4dp",
		width:"100%",
		height:"70%",
		color:"#000000",
		vertical:Ti.UI.TEXT_VERTICAL_ALIGNMENT_TOP,
		textAlign:Ti.UI.TEXT_ALIGNMENT_CENTER,
		text:"Delete this media file?"
	});
	bd = Ti.UI.createButton({
		width:"50%",
		height:"20%",
		bottom:"0dp",
		right:"0dp",
		title:"Delete",
		color:"#000000"
	});
	bc = Ti.UI.createButton({
		width:"50%",
		height:"20%",
		bottom:"0dp",
		left:"0dp",
		title:"Cancel",
		color:"#000000"
	});

	bc.addEventListener('click',function(){
		bc.setColor("#D9DADC");
		$.compose_window.remove(mw);
	});
	bd.addEventListener('click',function(){
		bd.setColor("#D9DADC");
		m = photosCollection.get(row.model);
		m.destroy();
		$.compose_window.remove(mw);
	});

	mw.add(lbl);
	mw.add(bd);
	mw.add(bc);
	$.compose_window.add(mw);
}

var cameraEnabled = true;
var saveEnabled = true;

function buttonStyling() {
	$.web_view.evalJS('$("button.publish").prop("disabled", '+!saveEnabled+')');
	$.web_view.evalJS('$("button.select").add("button.take").prop("disabled", '+!cameraEnabled+')');
}

// Hook up the web_view events
$.web_view.addEventListener('load', function(e) {
	Ti.API.info("Loaded web_view.");
	// if($.gif_wall_table.data[0] || $.gif_wall_table.data[0].rows.length == 0)
	// 	$.web_view.evalJS('$("button.publish").hide()');
});

$.gif_wall_table.addEventListener('postlayout', function(e) {

});

Ti.App.addEventListener('app:btnAction', function(e) {
	if (e.btn == 'publish') {
		enabledSaveAction();
	} else if (e.btn == 'take') {
		enabledShowCameraAction();
	} else if (e.btn == 'select') {
		enabledShowGalleryAction();
	}
});

$.compose_window.setOrientationModes([Titanium.UI.PORTRAIT]);
Titanium.UI.orientation = Titanium.UI.PORTRAIT;

$.compose_window.addEventListener('focus',function(e){
	photosCollection.fetch();
	addActivityIndicator(e.source);
	try {
		if($.gif_wall_table.data[0].rows.length > 1){
			$.gif_wall_table.scrollToIndex(($.gif_wall_table.data[0].rows.length -1));
			checkForFailedUploads() ;
		}
	} catch(error) {
		Ti.API.error('no row data');
	}
});

$.gif_wall_table.addEventListener('longpress',function(e){
	if($.gif_wall_table.data[0] && $.gif_wall_table.data[0].rows.length > 0)
		showDeleteMediaModal(e.rowData);
});

Ti.App.addEventListener('showSave', function(){
	$.web_view.evalJS('$("button.publish").show()');
})

Ti.App.addEventListener('disableSave',function(){
	saveEnabled = false;
	buttonStyling();
});
Ti.App.addEventListener('enableSave',function(){
	saveEnabled = true;
	buttonStyling();
});

Ti.App.addEventListener('disableShowCamera',function(){
	cameraEnabled = false;
	buttonStyling();

	Ti.App.fireEvent('disableSave');
});
Ti.App.addEventListener('enableShowCamera',function(){
	cameraEnabled = true;
	buttonStyling();
});

//fired after image successfully uploads in alloy.js
Ti.App.addEventListener('photoUploaded',function(){
	//force rows of gif_wall_table to update with current model state
	photosCollection.fetch();
	try {
		if($.gif_wall_table.data[0].rows.length > 1){
			$.gif_wall_table.scrollToIndex(($.gif_wall_table.data[0].rows.length -1));
		}
	} catch(error) {
		Ti.API.error('no row data');
	}
});

//fired when image fails to uploads in alloy.js
Ti.App.addEventListener('photoFailedToUpload',function(){
	try {
		if($.gif_wall_table.data[0].rows.length > 1){
			$.gif_wall_table.scrollToIndex(($.gif_wall_table.data[0].rows.length -1));
		}
	} catch(error) {
		Ti.API.error('no row data');
	}
	reuploader = Ti.UI.createView({
		id:'reuploader',
		top:'0dp',
		left:'0dp',
		width:'100%',
		height:'40dp',
		backgroundColor:'#ffffff',
		zIndex:'100',
		opacity:0.85
	});
	lbl = Ti.UI.createLabel({
		left:"10dp",
		width:Titanium.UI.SIZE,
		text:"Upload failed."
	});
	btn = Ti.UI.createButton({
		right:"10dp",
		height:'30dp',
		width:"80dp",
		textAlign:Ti.UI.TEXT_ALIGNMENT_CENTER,
		title:"Retry",
		borderColor:'#000000',
		borderWidth:'1dp',
		backgroundColor:"#ffffff"
	});
	btn.addEventListener('click',function(){
		$.compose_window.remove(reuploader);
		Ti.App.fireEvent('retryFailedUploads');
	});

	reuploader.add(lbl);
	reuploader.add(btn);

	$.compose_window.add(reuploader);
});

function checkForFailedUploads() {
	if(Titanium.App.Properties.getInt('num_active_xhr') == 0 && Titanium.App.Properties.getBool('is_camera_open')==false){
		fu = photosCollection.where({'is_uploaded':0});
		if(fu.length>0){
			Ti.App.fireEvent('photoFailedToUpload');
		}
	}
}

function disabledShowCameraAction() {
	return
}

function enabledShowCameraAction() {
	showHiveCamera();
}
function disabledShowGalleryAction() {
	return
}

function enabledShowGalleryAction() {
	showHiveGallery();
}

function disabledSaveAction() {
	alert("Wait for images to finish loading before saving.");
}

function enabledSaveAction() {
	var save = Alloy.createController('Save');
	save.getView('save_window').open();
}


