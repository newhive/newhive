define([], function(){

var o = {}, env = o
// o.padding = 10;
o.show_move_sensitivity = false;
o.no_snap = false;
o.show_mini_selection_border = false
o.copy_table = false;

o.scrollX = o.scrollY = 0;

o.globals = {}
o.globals_set = {}

// 1 editor unit := scale client pixels
// The editor is 1000 units wide inside a 1000*scale pixel window
var scale = 1, zoom = 1, padding = 10
o.offset = [0,0]
o.scale_set = function(){
    o.win_size = [$(window).width(), $(window).height()]
    scale = zoom * $(window).width() / 1000;
};
o.scale = function(){ return scale }
o.zoom_set = function(_zoom) {
    zoom = _zoom;
    o.canvas_size_update()
}
o.zoom = function(){ return zoom; };
o.padding = function() { return padding; };
o.padding_set = function(_padding) { padding = _padding; };

o.canvas_size_update = function(){
    o.scale_set()

    var canvas_size = o.u._mul(zoom, o.win_size)
        ,offset_x = 0
    o.offset[0] = 0
    if(zoom < 1)
        o.offset[0] = offset_x = (1 - zoom) * o.win_size[0] / 2
    o.apps_e.toggleClass('zoomed', zoom < 1)
    canvas_size[1] = Math.max( canvas_size[1], o.Apps.dims()[1] )

    o.apps_e.add('#bg')
        .width(canvas_size[0]).height(canvas_size[1]).css('left', offset_x)
    o.apps_e.css('left',
        offset_x - parseFloat(o.apps_e.css('border-left-width')) )
    $('#controls').css('left', offset_x)
    $('body').css('height', Math.max(canvas_size[1], o.win_size[1]))

    o.layout_apps()
    o.Background.layout()
}

// TODO: move these to user record
o.tiling = { 
    aspect: .5*(Math.sqrt(5) + 1)
    ,columns: 3.5
    ,padding: 10
}


return o;
});
