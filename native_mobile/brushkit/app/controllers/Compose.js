var photosCollection = Alloy.Collections.instance('Photos');

function dofilter(_collection) {

}

function doTransform(model) {

}


$.gif_wall_table.addEventListener('postlayout', function(_e) {
	if($.gif_wall_table.data[0].rows != 'undefined'){
		Ti.API.info('$.gif_wall_table.data[0].rows.length: '+ $.gif_wall_table.data[0].rows.length);
		$.gif_wall_table.scrollToIndex(($.gif_wall_table.data[0].rows.length -1));
	}
});

$.select.addEventListener('click',function() {
	showHiveGallery();
});

$.take.addEventListener('click', function(){
	showHiveCamera();
});

$.save.addEventListener('click', function(){
	var save = Alloy.createController('Save');
	save.getView('save_window').open();
});

$.compose_window.addEventListener('focus',function(e){
	addActivityIndicator(e.source);
});



