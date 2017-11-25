define([], function(){

// 1 editor unit := scale client pixels
// The editor is 1000 units wide inside a 1000*scale pixel window
var scale = 1, zoom = 1, padding = 10, grid_size = 20,
    snap_none = 0, snap_obj = 1, snap_grid = 2

var o = {}, env = o
// o.padding = 10
o.show_move_sensitivity = false
o.snap = snap_obj
o.snap_toggle = function(){
    o.snap = snap_obj == snap_obj ? snap_grid : snap_obj
    $('.snap_opts').text( snap_obj == 1 ? 'snap object' : 'snap text' )
}
o.copy_table = false

o.scroll = [0, 0]

o.globals = {}
o.globals_set = {}

o.offset = [0,0]
o.scale_set = function(){
    o.win_size = [$(window).width(), $(window).height()]
    scale = zoom * o.win_size[o.layout_coord] / 1000;
}
o.scale = function(){ return scale }
o.zoom_set = function(_zoom) {
    zoom = _zoom;
    o.canvas_size_update()
}
o.zoom = function(){ return zoom; };
o.padding = function() { return padding; };
o.padding_set = function(_padding) { padding = _padding; };
o.grid_set = function(s) {
    grid_size = s
    var vs = s * zoom
    $('#grid_guide #b').attr({ width:vs, height:vs })
    $('#grid_guide #b .h').attr('x2', vs)
    $('#grid_guide #b .v').attr('y2', vs)
}
o.grid = function(s){ return grid_size }
var canvas_size = [1000, 1000]
o.canvas_size = function() { return canvas_size.slice(); }

o.dims = function(){
    var dims = [1000, 1000 * o.win_size[1 - o.layout_coord] /
      o.win_size[o.layout_coord]]
    if(o.layout_coord) dims.reverse()
    return dims
}

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
    var view_height = Math.max(canvas_size[1], o.win_size[1])
    $('body').css('height', view_height)
    $('#grid_guide')[0].setAttribute('viewBox', [0, 0].concat(o.dims()).join(' '))
    o.grid_set(grid_size)

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
