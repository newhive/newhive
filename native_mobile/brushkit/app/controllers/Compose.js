var photosCollection = Alloy.Collections.instance('Photos');

function dofilter(_collection) {
	//return _collection.where();
}

function doTransform(model) {

}


$.gif_wall_table.addEventListener('postlayout', function(e) {
	try {
		if($.gif_wall_table.data[0].rows.length > 1){
			$.gif_wall_table.scrollToIndex(($.gif_wall_table.data[0].rows.length -1));
		}
	} catch(error) {
		Ti.API.error('no row data');
	}
});

$.select.addEventListener('click',function() {
	showHiveGallery();
});

$.take.addEventListener('click', enabledShowCameraAction);

$.save.addEventListener('click', enabledSaveAction);

$.compose_window.addEventListener('focus',function(e){
	photosCollection.fetch();
	addActivityIndicator(e.source);
});

Ti.App.addEventListener('disableSave',function(){
	$.save.backgroundColor = "#c3c3c3";
	$.save.color = "#ffffff";
	$.save.removeEventListener('click',enabledSaveAction);
	$.save.addEventListener('click',disabledSaveAction);
});
Ti.App.addEventListener('enableSave',function(){
	$.save.backgroundColor = "#aef0e8";
	$.save.color = "#000000";
	$.save.removeEventListener('click',disabledSaveAction);
	$.save.addEventListener('click',enabledSaveAction);
});

Ti.App.addEventListener('disableShowCamera',function(){
	Ti.API.info('DISABLE THE GODDAMN CAMERA');
	$.take.backgroundColor = "#c3c3c3";
	$.take.color = "#ffffff";
	$.take.removeEventListener('click',enabledShowCameraAction);
	$.take.addEventListener('click',disabledShowCameraAction);
});
Ti.App.addEventListener('enableShowCamera',function(){
	$.take.backgroundColor = "#aef0e8";
	$.take.color = "#000000";
	$.take.removeEventListener('click',disabledShowCameraAction);
	$.take.addEventListener('click',enabledShowCameraAction);
});

function disabledShowCameraAction() {
	return
}

function enabledShowCameraAction() {
	showHiveCamera();
}

function disabledSaveAction() {
	alert("Wait for images to finish loading before saving.");
}

function enabledSaveAction() {
	var save = Alloy.createController('Save');
	save.getView('save_window').open();
}


