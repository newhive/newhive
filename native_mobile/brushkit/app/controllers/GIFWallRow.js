// $.gif_wall_image.addEventListener('slide',function(e){
// 	Ti.API.info('sliding from the image itself: '+ e.direction);
// });


// object to store last event position
var touchMoveBase = {
	set: function(point) {
		this.x = point.x;
		this.y = point.y;
	}
}
// image position before it has been animated
var imagePosition = { top: 0, left: 0 };
 
$.gif_wall_image.addEventListener('touchstart', function(e) {
	Titanium.API.info('Touch start: ' + JSON.stringify(e));
	// get absolute position at start
	touchMoveBase.set({x:e.x, y:e.y});
});
 
$.gif_wall_image.addEventListener('touchmove', function(e) {
	Titanium.API.info('Moving: ' + JSON.stringify(e));
	// update the co-ordinates based on movement since last movement or touch start
	imagePosition.top += e.y - touchMoveBase.y; 
	imagePosition.left += e.x - touchMoveBase.x;

	Titanium.API.info('go touchMoveBase.x: ' + touchMoveBase.x);
	Titanium.API.info('go e.x : ' +e.x );
	Titanium.API.info('go left: ' + imagePosition.left);

	$.gif_wall_image.animate({
		left: imagePosition.left,
		duration: 1 
	});
	// reset absolute position to current position so next event will be relative to current position
	touchMoveBase.set({x:e.x, y:e.y});
});
 
$.gif_wall_image.addEventListener('touchend', function(e) {
	Titanium.API.info('Stop drag: ' + JSON.stringify(e));
});

