var photosCollection = Alloy.Collections.instance('Photos');

function dofilter(_collection) {
	//return _collection.where();
}

function doTransform(model) {

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


$.gif_wall_table.addEventListener('postlayout', function(e) {
	try {
		if($.gif_wall_table.data[0].rows.length > 1){
			$.gif_wall_table.scrollToIndex(($.gif_wall_table.data[0].rows.length -1));
		}
	} catch(error) {
		Ti.API.error('no row data');
	}
});

$.select.addEventListener('click',enabledShowGalleryAction);

$.take.addEventListener('click', enabledShowCameraAction);

$.save.addEventListener('click', enabledSaveAction);

$.compose_window.addEventListener('focus',function(e){
	photosCollection.fetch();
	addActivityIndicator(e.source);
});

$.gif_wall_table.addEventListener('longpress',function(e){
	showDeleteMediaModal(e.rowData);
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
	$.take.backgroundColor = "#c3c3c3";
	$.take.color = "#ffffff";
	$.take.removeEventListener('click',enabledShowCameraAction);
	$.take.addEventListener('click',disabledShowCameraAction);

	$.select.backgroundColor = "#c3c3c3";
	$.select.color = "#ffffff";
	$.select.removeEventListener('click',enabledShowGalleryAction);
	$.select.addEventListener('click',disabledShowGalleryAction);

	Ti.App.fireEvent('disableSave');
});
Ti.App.addEventListener('enableShowCamera',function(){
	$.take.backgroundColor = "#aef0e8";
	$.take.color = "#000000";
	$.take.removeEventListener('click',disabledShowCameraAction);
	$.take.addEventListener('click',enabledShowCameraAction);

	$.select.backgroundColor = "#aef0e8";
	$.select.color = "#000000";
	$.select.removeEventListener('click',disabledShowGalleryAction);
	$.select.addEventListener('click',enabledShowGalleryAction);
});

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


