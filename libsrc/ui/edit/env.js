define([], function(){

var o = {}, env = o
// o.padding = 10
o.show_move_sensitivity = false
o.no_snap = false
o.copy_table = false

o.scroll = [0, 0]

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
var canvas_size = [1000, 1000]
o.canvas_size = function() { return canvas_size.slice(); }

o.canvas_size_update = function(no_layout){
    o.scale_set()

    canvas_size = o.u._mul(zoom, o.win_size)
    var offset_x = 0
    o.offset[0] = 0
    if(zoom < 1)
        o.offset[0] = offset_x = (1 - zoom) * o.win_size[0] / 2
    o.apps_e.toggleClass('zoomed', zoom < 1)
    canvas_size[1] = Math.max( canvas_size[1], o.Apps.dims()[1] )

    o.apps_e.css('left',
        offset_x - parseFloat(o.apps_e.css('border-left-width')) )
    $('#controls').css('left', offset_x)
    $('body').css('height', Math.max(canvas_size[1], o.win_size[1]))

    if (!no_layout) {
        o.layout_apps()
        // Because adding/removing scroller might cause canvas size update
        setTimeout(function() { o.canvas_size_update(true) }, 1)
    }
    o.Background.layout()
}

// TODO: move these to user record
o.tiling = { 
    aspect: .5*(Math.sqrt(5) + 1)
    ,columns: 3.5
    ,padding: 10
}

return o
});
