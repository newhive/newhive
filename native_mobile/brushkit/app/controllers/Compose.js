//var photosCollection = Alloy.Collections.Photos;

Ti.App.addEventListener('buildComposeWindow', function(){
	$.scroll_view.removeAllChildren();
	photosCollection.each(function(p, index){
		if(p != undefined){
			var img = p.get('photo_blob');
			var img_view = Ti.UI.createImageView({
				image:img,
				width:"99%"
			});
			
			//add listener to last elem to scroll to bottom of scroll_view
			if((index+1) == photosCollection.length){
				img_view.addEventListener('postlayout', function(){
					$.scroll_view.scrollToBottom();
				});
			}
			
			$.scroll_view.add(img_view);
		} else {
		}
	});
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



