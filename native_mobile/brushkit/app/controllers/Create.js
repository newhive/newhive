
$.select.addEventListener('click',function() {
	showHiveGallery();
});

$.take.addEventListener('click', function(){
	showHiveCamera();
});

$.create_window.addEventListener('focus',function(e){
	addActivityIndicator(e.source);
});