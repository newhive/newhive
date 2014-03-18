var photosCollection = Alloy.Collections.instance('Photos');

function dofilter(_collection) {

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

$.gif_wall_table.addEventListener('swipe',function(e){
	Ti.API.info('slide!');
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
	photosCollection.fetch();
});



