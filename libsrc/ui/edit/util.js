define([
    'browser/jquery'
    ,'browser/js'
    
    ,'context'
    ,'ui/colors'
    ,'sj!templates/color_picker.html'
    ,'ui/menu'
    ,'ui/dialog'

    ,'./env'
], function(
    $
    ,js
    
    ,context
    ,colors
    ,color_picker_template
    ,menu
    ,dialog

    ,env
){

var o = {}
    ,u = o
    ,bound = js.bound;
env.u = o

// For performance-critical ops, do not use jquery style
o.inline_style = function(el, styles) {
    var el_style = el.style
    $.each(styles, function(style_name, style_val) {
        el_style[style_name] = style_val + 'px'
    })
}

// Returns true for a pseudo-control key (control on real computers, meta on macs)
o.is_ctrl = function(ev){
    ev = ev || env.ev;
    return ev && (ev.ctrlKey || ev.metaKey);
}
o.should_snap = function(ev) {
    ev = ev || env.ev;
    return !ev || !(ev.altKey);
}

// convert from pos/dims into a dict with left/right/width/height
o.css_coords = function(el, pos, dims){
    return el.css({ left: pos[0], top: pos[1]
        ,width: dims[0], height: dims[1] })
}

// convert between degrees and radians
o.rad2deg = function(angle) { return angle * (180. / Math.PI) }
o.deg2rad = function(angle) { return angle * (Math.PI / 180.) }

// rotate the given 2-vector counterclockwise (y-up) through angle radians
o.rotate = function(pt, angle) {
    var cos = Math.cos(angle);
    var sin = Math.sin(angle);
    var res = [];
    res[0] = pt[0]*cos - pt[1]*sin;
    res[1] = pt[1]*cos + pt[0]*sin;
    return res;
}

// rotate the given point counterclockwise (y-up) through angle radians
// about a particular point in 2-space
o.rotate_about = function(pt, cent, angle) {
    return o._add(cent)(o.rotate(o._sub(pt)(cent), angle));
}

// TODO: remove duplication from ui/util
// Return -1 if x < 0, 1 if x > 0, or 0 if x == 0.
o._sign = function(x) {
    return typeof x === 'number' ? x ? x < 0 ? -1 : 1 : x === x ? 0 : NaN : NaN;
}

o._apply = function(func, scale) {
    var scalar_functor = function(l) {
        if (typeof(l) == "number") return func(scale, l);
        return $.map(l, function(x) { return func(scale, x); });
    }
    var vector_functor = function(l) {
        // TODO: error handling?
        if (typeof(l) == "number") {
            return $.map(scale, function(x, i) { return func(x, l); });
        } else {
            return $.map(l, function(x, i) { return func(scale[i], x); });
        }
    }
    var variadic_functor = function(s) {
        return (typeof(s) == "number") ? scalar_functor : vector_functor;
    }
    if (arguments.length < 3)
        return variadic_functor(scale);
    // var accum = (scale.slice) ? scale.slice() : scale;
    for (var i = 2; i < arguments.length; ++i) {
        // scale = accum;
        scale = variadic_functor(scale)(arguments[i]);
    }
    return scale;
};

o._mul = function(){ return o._apply.apply(null, 
    [js.op['*']].concat(Array.prototype.slice.call(arguments, 0))) }
o._add = function(){ return o._apply.apply(null, 
    [js.op['+']].concat(Array.prototype.slice.call(arguments, 0))) }
o._div = function(){ return o._apply.apply(null, 
    [js.op['/']].concat(Array.prototype.slice.call(arguments, 0))) }
o._sub = function(){ return o._apply.apply(null, 
    [js.op['-']].concat(Array.prototype.slice.call(arguments, 0))) }
o._inv = function(l){ return l.map(function(x){ return 1/x; }) }
o._min = function(){ return o._apply.apply(null, 
    [Math.min].concat(Array.prototype.slice.call(arguments, 0))) }
o._max = function(){ return o._apply.apply(null, 
    [Math.max].concat(Array.prototype.slice.call(arguments, 0))) }

// Linear interpolation
// Return a value that is alpha (scalar) of the way between old_val
// and new_val.  The values can be numbers or equal-length vectors.
o._lerp = function(alpha, old_val, new_val) {
    if (typeof(old_val) == "number") {
        return alpha * new_val + (1 - alpha) * old_val;
    } else {
        return o._apply(function(old_val, new_val) {
            return alpha * new_val + (1 - alpha) * old_val;
        }, old_val)(new_val);
    }
};

// returns list of intervals in x- and y- dimensions which bound the input 
// points exactly
o.points_rect = function(ps){
    var f = [[Infinity, -Infinity], [Infinity, -Infinity]]
    ps.map(function(p){
        f[0][0] = Math.min(f[0][0], p[0])
        f[0][1] = Math.max(f[0][1], p[0])
        f[1][0] = Math.min(f[1][0], p[1])
        f[1][1] = Math.max(f[1][1], p[1])
    })
    return f
}

// Returns the nonnegative (nonoverlapping) distance btw two intervals.
o.interval_dist = function(a, b) {
    var c = [a[1] - b[0], a[0] - b[1]];
    if (c[0] * c[1] <= 0)
        return 0;
    return Math.min(Math.abs(c[0]), Math.abs(c[1]));
};

o.dist = function(a, b) {
    if (b) return o.interval_size([a,b])
    return o.interval_size(a)
}
o.interval_size = function(i) { return Math.abs(i[1] - i[0]); };
// Returns the least interval containing both inputs
o.interval_bounds = function(a, b) {
    return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
};
// Force x into the interval [a, b]
// a can also be passed as an interval and b left undefined
o.interval_constrain = function(x, a, b) {
    if (b == undefined) {
        b = a[a.length - 1];
        a = a[0];
    }
    return Math.min(b, Math.max(a, x));
};

// Useful for default values when using interval_bounds
o.null_interval = [Infinity, -Infinity];
o.all_interval = [-Infinity, Infinity];
////////

// gives an array function for moving an element around
o.has_shuffle = function(arr) {
    arr.move_element = function(from, to){
        var e = arr.splice(from, 1)[0];
        arr.splice(to, 0, e);
    };
};
// Shallow array comparison
o.array_equals = function(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length === undefined || b.length === undefined) return false;
  if (a.length != b.length) return false;

  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

o.epsilon_eq = function(a, b, epsilon) {
    return (Math.abs(a - b) < epsilon)
}
o.isNaN = function(x) {
    return typeof(x) == "number" && isNaN(x)
}
    
// deep object comparison
o.deep_equals = function(o1, o2, epsilon) {
    if (o1 == null || o2 == null || typeof(o1) != "object" || typeof(o2) != "object")
        return o1 == o2 || (o.isNaN(o1) && o.isNaN(o2))
             || (epsilon && typeof(o1) == "number" && typeof(o2) == "number" 
                && o.epsilon_eq(o1, o2, epsilon))

    var k1 = Object.keys(o1).sort();
    var k2 = Object.keys(o2).sort();
    if (k1.length != k2.length) 
        return false;
    for (var i in k1) {
        var key1 = k1[i], key2 = k2[i]
        if (key1 != key2) {
            // console.log("Keys differ: " + key1 + " " + key2)
            return false
        }
        var a = o1[key1], b = o2[key2]
        if (key1 == "position") {
            if (!o.deep_equals(a, b, 1e-6)) {
                // console.log("objects differ: " + key1 + ": " + a + 
                //     "\n" + key2 + ": " + b)
                return false
            }
        }
        else if (!o.deep_equals(a, b, epsilon)) {
            // console.log("objects differ: " + key1 + " " + key2)
            return false
        }
    }
    return true
}

// returns the array of the nth element of every member array
o.nth = function(array, n) {
    return array.map(function(x) { return x[n] })
}
o.max = function(array){
    return Math.max.apply(Math, array);
};
o.min = function(array){
    return Math.min.apply(Math, array);
};

// Add stable merge sort to Array and jQuery prototypes
// Note: We wrap it in a closure so it doesn't pollute the global
//       namespace, but we don't put it in $(document).ready, since it's
//       not dependent on the DOM
// http://stackoverflow.com/questions/1427608/fast-stable-sorting-algorithm-implementation-in-javascript
(function() {

  // expose to Array and jQuery
  Array.prototype.merge_sort = jQuery.fn.merge_sort = merge_sort;
  Object.defineProperty(Array.prototype, "merge_sort", {enumerable: false})
  function merge_sort(compare) {

    var length = this.length,
        middle = Math.floor(length / 2);

    if (!compare) {
      compare = function(left, right) {
        if (left < right)
          return -1;
        if (left == right)
          return 0;
        else
          return 1;
      };
    }

    if (length < 2)
      return this;

    return merge(
      this.slice(0, middle).merge_sort(compare),
      this.slice(middle, length).merge_sort(compare),
      compare
    );
  }

  function merge(left, right, compare) {

    var result = [];

    while (left.length > 0 || right.length > 0) {
      if (left.length > 0 && right.length > 0) {
        if (compare(left[0], right[0]) <= 0) {
          result.push(left[0]);
          left = left.slice(1);
        }
        else {
          result.push(right[0]);
          right = right.slice(1);
        }
      }
      else if (left.length > 0) {
        result.push(left[0]);
        left = left.slice(1);
      }
      else if (right.length > 0) {
        result.push(right[0]);
        right = right.slice(1);
      }
    }
    return result;
  }
})();

var checkIfAllArgumentsAreArrays = function (functionArguments) {
    for (var i = 0; i < functionArguments.length; i++) {
        if (!(functionArguments[i] instanceof Array)) {
            throw new Error('Every argument must be an array!');
        }
    }
}

o.distinct = function (array) {
    if (arguments.length != 1) throw new Error('There must be exactly 1 array argument!');
    checkIfAllArgumentsAreArrays(arguments);

    var result = [];

    for (var i = 0; i < array.length; i++) {
        var item = array[i];

        if ($.inArray(item, result) === -1) {
            result.push(item);
        }
    }

    return result;
}

o.union = function (/* minimum 2 arrays */) {
    if (arguments.length == 0 ) return []
    else if (arguments.length == 1) return arguments[0];
    checkIfAllArgumentsAreArrays(arguments);

    var result = o.distinct(arguments[0]);

    for (var i = 1; i < arguments.length; i++) {
        var arrayArgument = arguments[i];

        for (var j = 0; j < arrayArgument.length; j++) {
            var item = arrayArgument[j];

            if ($.inArray(item, result) === -1) {
                result.push(item);
            }
        }
    }

    return result;
}

o.intersect = function (/* minimum 2 arrays */) {
    if (arguments.length == 0 ) return []
    else if (arguments.length == 1) return arguments[0];
    // if (arguments.length < 2) 
    //    throw new Error('There must be minimum 2 array arguments!');
    checkIfAllArgumentsAreArrays(arguments);

    var result = [];
    var distinctArray = o.distinct(arguments[0]);
    if (distinctArray.length === 0) return [];

    for (var i = 0; i < distinctArray.length; i++) {
        var item = distinctArray[i];

        var shouldAddToResult = true;

        for (var j = 1; j < arguments.length; j++) {
            var array2 = arguments[j];
            if (array2.length == 0) return [];

            if ($.inArray(item, array2) === -1) {
                shouldAddToResult = false;
                break;
            }
        }

        if (shouldAddToResult) {
            result.push(item);
        }
    }

    return result;
}

o.except = function (/* minimum 2 arrays */) {
    if (arguments.length < 2) throw new Error('There must be minimum 2 array arguments!');
    checkIfAllArgumentsAreArrays(arguments);

    var result = [];
    var distinctArray = o.distinct(arguments[0]);
    var otherArraysConcatenated = [];

    for (var i = 1; i < arguments.length; i++) {
        var otherArray = arguments[i];
        otherArraysConcatenated = otherArraysConcatenated.concat(otherArray);
    }

    for (var i = 0; i < distinctArray.length; i++) {
        var item = distinctArray[i];

        if ($.inArray(item, otherArraysConcatenated) === -1) {
            result.push(item);
        }
    }

    return result;
}

// TODO: create consecutive, type-named id's (text_1 text_2 image_0...)
// used for app id
o.random_str = function(){ 
    return ('a' + Math.random().toString(16).slice(2) + '0000000').slice(0, 8);
};

o.polygon = function(sides){
    js.range(sides - 1).map(function(i){
        var a = i == 0 ? 0 : Math.PI * 2 / i
        return [Math.cos(a), Math.sin(a)]
    })
}

//// BEGIN-editor-refactor belongs in editor specific utils
// Sort two apps, first by top, then by left
o.topo_cmp = function(app1, app2) {
    var a = app2.min_pos(), b = app1.min_pos();
    if (Math.abs(a[1] - b[1]) > 0.5)
        return b[1] - a[1];
    return b[0] - a[0];
}
o.retile = function(opts) {
    opts = $.extend({ 
            start_pos:env.Selection.min_pos().slice()
            ,width:env.Selection.max_pos()[0] - env.Selection.min_pos()[0]
        }
        ,env.tiling, opts)
    var apps = env.Selection.sorted()
    env.History.change_start(apps)
    env.Apps.begin_layout()
    if (opts.natural) {
        opts.aspects = apps.map(function(a) { return a.aspect || a.get_aspect() })
    } else {
        opts.aspects = apps.map(function(a) { 
            return a.get_aspect() ? a.current_aspect() : a.get_aspect() })
    }
    var regions = o.tile_magic(apps.length, opts)
    for (var i = 0; i < apps.length; ++i) {
        var app = apps[i]
        if (opts.natural && app.aspect) {
            if (app.init_state.scale_x)
                app.init_state.scale_x = 1
            app.fit_to({pos:regions[i][0], dims:regions[i][1]
                , scaled:[app.aspect,1]})
        } else {
            app.aabb_set([ regions[i][0], u._add(regions[i][0], regions[i][1]) ])
            // app.pos_relative_set(regions[i][0])
            // app.dims_relative_set(regions[i][1])
        }
        if (app.recenter) app.recenter()
    }
    env.Apps.end_layout()
    env.Selection.update_relative_coords();
    env.History.change_end("retile", {collapse: true})
}
// return an ordered list of count [pos, dims] pairs to tile
o.tile_magic = function(count, opts) {
    opts = $.extend({
        columns:3               // max columns in any row
        ,width:1000             // width to fill
        ,aspect:1.61            // preferred aspect ratio of elements
        ,padding:env.padding()  // padding between elements
        ,start_pos: [0, 0]      // where to position the 0th element
        ,aspects:[]             // list of aspects for each object
    }, opts)
    var max_columns = opts.columns, row_width = opts.width, aspect = opts.aspect
        ,padding = opts.padding, start_pos = opts.start_pos
        ,rows = Math.ceil(count / max_columns), pos = start_pos.slice()
        ,remainder = count, mod = count / rows, surplus = 0
        ,res = [], n = 0
    for (var y = 0; y < rows; ++y) {
        surplus += mod
        var columns = Math.round(surplus)
            ,cur_padding = Math.min(padding, (row_width)/(columns - 1) - 2)
            ,total_pad = (columns - 1)*cur_padding
            ,total_width = (row_width - total_pad)
            ,dims = [aspect, 1]
            ,first_n = n, row_aspect = 0

        for (var x = 0; x < columns; ++x) {
            var new_aspect = opts.aspects[n++] || aspect
            row_aspect += new_aspect
        }
        dims[1] = total_width / row_aspect
        n = first_n
        for (var x = 0; x < columns; ++x) {
            var new_aspect = opts.aspects[n++] || aspect
            dims[0] = dims[1] * new_aspect
            res.push([pos.slice(), dims.slice()])
            pos[0] += dims[0] + cur_padding
        }
        pos[0] = start_pos[0]
        pos[1] += dims[1] + cur_padding
        surplus -= columns
    }
    return res
}
o.region_from_app = function(app) {
    var min_pos = app.min_pos(), max_pos = app.max_pos();
    return { left: min_pos[0], right: max_pos[0],
        top: min_pos[1], bottom: max_pos[1], };
}
o.overlapped_apps = function(region, full) {
    // var select = { top: o.drag_pos[1], right: o.drag_pos[0] + o.drag_dims[0],
    //     bottom: o.drag_pos[1] + o.drag_dims[1], left: o.drag_pos[0] };
    // o.old_selection = o.new_selection;
    var some_overlap = function(region, pos, dims) {
        return (region.bottom >= pos[1]
            && region.right >= pos[0]
            && region.left <= pos[0] + dims[0]
            && region.top <= pos[1] + dims[1]);
    }
    var full_overlap = function(region, pos, dims) {
        return (region.top <= pos[1]
            && region.left <= pos[0]
            && region.right >= pos[0] + dims[0]
            && region.bottom >= pos[1] + dims[1]);
    }
    var overlap = full ? full_overlap : some_overlap
    return $.grep(env.Apps.all(), function(el){
        var dims = el.dims_relative();
        var pos = el.pos_relative();
        return overlap(region, pos, dims);
    });
};

o.pos_dims2aabb = function(pos_dims) {
    var pos = pos_dims[0], dims = pos_dims[1]
    return [pos, o._add(pos, dims)]
}
o.aabb2pos_dims = function(aabb) {
    return [aabb[0], o._sub(aabb[1], aabb[0])]
}
o.aabb2intervals = function(aabb) {
    var intervals = [[],[]]
    for (var i = 0; i < 2; ++i) {
        intervals[i] = [aabb[0][i], aabb[1][i]]
    }
    return intervals
}
// constrain a point to lie within an axis-aligned bounding box
o.constrain_pt_aabb = function(aabb, pt) {
    var intervals = o.aabb2intervals(aabb)
    return pt.map(function(x, i) {
        return o.interval_constrain(x, intervals[i])
    })
}
// constrain one aabb to lie within another (_aabb)
o.constrain_aabb = function(aabb, _aabb, _min) {
    _min = _min || [-Infinity, -Infinity]
    var res = aabb.map(function(pos, i) {
        return o.constrain_pt_aabb(_aabb, pos)
    })
    res[1] = res[1].map(function(x, i) {
        return Math.max(x, res[0][i] + _min[i])
    })
    return res
}

o.app_bounds = function(elements) { 
    var abs_mins = elements.map(function(el){ return el.min_pos() });
    var abs_maxs = elements.map(function(el){ return el.max_pos() });
    return {
        left:   o.min(abs_mins.map(function(c){ return c[0] })),
        top:    o.min(abs_mins.map(function(c){ return c[1] })),
        right:  o.max(abs_maxs.map(function(c){ return c[0] })),
        bottom: o.max(abs_maxs.map(function(c){ return c[1] }))
    };
};

// Ensure that the given point is viewable in the scroll range
o.scroll_to_view = function(pt) {
    var $body = $("body"), top = $body.scrollTop(), bottom = top + $body.height()
    if (pt[1] < top)
        $body.scrollTop(pt[1])
    else if (pt[1] > bottom)
        $body.scrollTop(pt[1] - (bottom - top))
}

// wrappers
o.hover_menu = function(handle, drawer, opts){
    return menu(handle, drawer, $.extend({ auto_height: false }, opts));
};
o.show_dialog = function(jq, opts){
    var d = dialog.create(jq, opts);
    d.open();
    return d;
};

var set_debug_info_timeout
o.set_debug_info = function(info, delay) {
    if (typeof(info) == "object")
        info = JSON.stringify(info).replace(/,/g,"\n")
    var $debug = $("#edit_debug");
    if ($debug.length == 0) {
        $debug = $("<div id='edit_debug' class='debug'</div>");
        $("body").append($debug);
    }
    if (!info) {
        $debug.hidehide();
        return;
    }
    clearTimeout(set_debug_info_timeout)
    if (delay) 
        set_debug_info_timeout = setTimeout(o.set_debug_info, delay)
    // TODO: option to put info over mouse
    $debug.showshow().css({ top: "0px", left: "0px" })
        .text("This box can only be seen if you are flagged can_debug\n" + info);
};

var times, distances, delta_latched;
// var move_speed, delta_ave;
o.reset_sensitivity = function() {
    delta_latched = [0, 0];
    // delta_ave = [0, 0];
    // move_speed = 1;
    times = [], distances = [];
};
// TODO: move sensitivity code globally
o.calculate_sensitivity = function(delta) {
    // Calculate sensitivity
    // check timestamp and bump sensitivity if longish
    // gap between user inputs.
    if (!delta_latched)
        return 1;
    var move_dist = o._sub(delta)(delta_latched);
    delta_latched = delta.slice();
    var time = new Date().getTime() / 1000;
    times.push(time);
    // Max is better than other distance metric because user will
    // commonly move in both axes accidentally.
    // TODO: track x and y independently
    var distance = Math.max(Math.abs(move_dist[0]), Math.abs(move_dist[1]));
    // Keep track of accumulated distance.
    distances.push(distance + 
        (distances.length ? distances[distances.length - 1] : 0));
    var max_sens_time = 1;
    while (times.length > 2 && time - times[0] > max_sens_time) {
        times.splice(0, 1);
        distances.splice(0, 1);
    }
    time = times[times.length - 1] - times[0];
    distance = distances[distances.length - 1] - distances[0];
    var speed = distance ? distance / time : 1;
    // speed = move_speed = o._lerp(.1, move_speed, speed);

    // Experiment with using distance to "average position"
    // delta_ave = o._lerp(.1, delta_ave, delta);
    // var move_dist = o._sub(delta)(delta_ave);
    // var speed = Math.abs(move_dist[0]) + Math.abs(move_dist[1]);
    // sensitivity = 1 / (speed - .98);
    var sensitivity = 150 / speed;
    if (times.length < 5)
        sensitivity *= 2;
    // TODO: flags like this should live on the root app.
    if (env.show_move_sensitivity && context.flags.can_debug)
        o.set_debug_info({
            sensitivity: Math.round(100*sensitivity)/100,
            time: Math.round(10000*time)/10000,
            distance: Math.round(10000*distance)/10000,
            speed: Math.round(100*speed)/100,
        });

    return sensitivity;
};


o.on_media_upload = function(files){
    // after file is uploaded, save meta data and id from server by
    // matching up file name
    var find_apps = function(name){
        // TODO-cleanup: background should be root app
        var apps = env.Apps.all().filter(function(a){
            return (a.init_state.file_name == name) });
        if (env.Exp.background.file_name == name)
            apps = apps.concat(env.Exp.background);
        return apps;
    };
    files.map(function(f){
        find_apps(f.name).map(function(a){
            var upd = { file_id: f.id, url: f.url };
            if(f.meta) upd.file_meta = f.meta;
            if(a.state_update) {
                a.state_update(upd);
            } else {
                a.content = a.url = f.url;
                a.file_name = f.id;
            }
        });
    });
};

o.new_file = function(files, opts, app_opts, filter) {
    // TODO-feature: depending on type and number of files, create grouping of
    // media objects. Multiple audio files should be assembled into a play
    // list. Multiple images should be placed in a table, or slide-show
    env.History.begin();
    if (context.flags.tile_multiple_images && files.length > 1) {
        var gutter = 20, width = 1000-2*gutter, columns = 3.5, padding = env.padding()
        if (opts.dimensions) width = opts.dimensions[0]
        columns = Math.max(1, columns * width / 1000)
        var start_pos = opts.position || 
            [gutter, Math.max(0, o.app_bounds(env.Apps.all()).bottom) + padding]
        var regions = o.tile_magic(files.length, {start_pos:start_pos, columns:columns
            ,aspect: 1.61, width:width, padding:padding 
        })
    }
    var loaded_count = 0;
    var apps = $.map(files, function(file, i){
        var app = $.extend({ file_name: file.name, file_id: file.id,
            file_meta: file.meta }, opts);
        if (regions) {
            app.position = regions[i][0]
            app.dimensions = regions[i][1]
            app.fit = 2
        }

        // TODO: html files should just be saved on s3 and inserted as an <iframe>
        // if(file.mime.match(/text\/html/)){
        //     // Not using code for auto-embeding urls that resolve to html
        //     // pages because of too many problems with sites that
        //     // don't want to be framed. Just link to site instead.
        //     // app = {type: 'hive.html', content: '<iframe src="' + file.original_url + '" style="width: 100%; height: 100%;"></iframe>'};
        //     $.extend(app, { type: 'hive.text', content:
        //         $('<a>').attr('href', file.original_url).text(file.original_url).outerHTML() });
        // }

        // TODO: make this work...
        // image = { content: file.url }
        // audio = { src: file.url }
        // link = { content: $('<a>').attr('href', file.url).text(file.name).outerHTML() }

        if(file.mime.match(/image\/(png|gif|jpeg)/)) app.type = 'hive.image';
        else if(file.mime.match(/audio\//)) app.type = 'hive.audio';
        else {
            app.type = 'hive.text';
            // TODO: implement read-only for text app so server response can simply
            // reset the link content, and not potentially lose changes to
            // text box made while file was uploading
            // app.read_only = true;
        }
        app.url = file.url;
        app.file_name = file.name

        if (filter && !filter(app))
            return;

        loaded_count++;
        var loaded = function() {
            if (!--loaded_count) {
                env.Selection.update(apps)
                if (context.flags.tile_multiple_images && files.length > 1)
                    o.retile({natural:1})//, start_pos:start_pos})
                env.Selection.scroll_to_view();
            }
        }
        if (!context.flags.tile_multiple_images)
            return env.new_app(app, $.extend({ offset: [20*i, 20*i], load:loaded }, app_opts) );
        else
            return env.new_app(app, $.extend({no_select:true, load:loaded}, app_opts) );
    });
    env.History.group('create');
    env.Selection.update(apps);
    if (regions)
        env.Selection.scroll_to_view();
    return apps;
};

var old_scale
env.layout_apps = o.layout_apps = function(force){
    env.scale_set();
    // force = true//!!
    if (!force && old_scale == env.scale())
        return

    old_scale = env.scale()
    $.map(env.Apps, function(a){ a.layout() });
    env.Background.layout()
    // handled by App.layout
    // if(env.Selection.controls) env.Selection.controls.layout();

    var zoom = 100*env.zoom();
    var padding_left = (zoom == 100) ? "30px" : zoom + "%";
    var padding_right = (zoom == 100) ? "30px" : "20px";
    $(".prompts .js_vcenter").css("padding-left", padding_left)
        .css("padding-right", padding_right);
    $(".prompts .highlight_box").css("width", zoom + "%");

    var min_height = 2*160 + $(".prompts .js_vcenter").height();
    var top = Math.max(0, o.app_bounds(env.Apps.all()).bottom) * env.scale();
    var bottom = Math.max(top + min_height, $(window).height());
    var margin = (bottom - top - $(".prompts .js_vcenter").height()) / 2;
    $(".prompts").css("top", top).height(bottom - top);
    $(".prompts .js_vcenter").css("margin-top", margin);

    // Set #happs to take the full scroll dimensions of the window.
    // Need to set to 0 first to allow for shrinking dimensions.
    // drag_base is no longer #happs
    // var body = $("body")[0];
    // $("#happs").height(0).height(body.scrollHeight)
    //     .width(0).width(body.scrollWidth);
};

o.snap_helper = function(my_tuple, opts) {
    var precision = function(goal) { return (Math.round(goal * 2) / 2).toString(); }
    opts = $.extend({
        exclude_ids: {},        // exclude apps with these ids to snap against
        snap_strength: 0.35,    // 1.0 is the strength of two apps right next to each other
                                // strength is additive, and highest strength wins.
                                // Do not snap if strength is less than this value
                                // NOTE: mid-center snapping multiplies strength by 0.4
        snap_radius: 10,        // Snap at most this far away
        sensitivity: 0,         // Exponent for falloff in the dimension of snap 
                                // (makes it not snap far away)
        padding: env.padding(), // Editor units to add to object snapping against each other
        guide_0: true,          // show horizontal guide
        guide_1: true,          // show vertical guide
    }, opts );
    var s = env.scale(),
        exclude_ids = opts.exclude_ids,
        snap_strength = opts.snap_strength,
        snap_radius = opts.snap_radius * env.padding()/10.,
        sensitivity = opts.sensitivity,
        padding = opts.padding,
        pos = [], show_guide = [];
    show_guide[0] = opts.guide_0;
    show_guide[1] = opts.guide_1;

    var left = 2;
    for (var j = 0; j < 3; j++){
        if (my_tuple[0][j] != undefined && pos[0] == undefined) {
            pos[0] = my_tuple[0][j];
            --left;
        }
        if (my_tuple[1][j] != undefined && pos[1] == undefined) {
            pos[1] = my_tuple[1][j];
            --left;
        }
        if (!left)
            break;
    }
    var tuple = [[],[]], new_pos = pos.slice();
    if (snap_radius < 0.5)
        return new_pos;
    // TODO-perf: save this array only after drag/drop
    // And keep it sorted
    var apps = env.Apps.all().filter(function(app) {
        return !(app.id in exclude_ids || env.Selection.selected(app));
    });
    // TODO: this 'root' app belongs as a permanent feature of env.Apps.
    // var app = Hive.App({
    //     position: [0, 0],
    //     dimensions: [1000, $("body")[0].scrollHeight / s],
    //     type: 'hive.root',
    // });
    // app.load();
    // apps = apps.concat([app]);
    if (opts.tuple) {
        tuple = opts.tuple;
    } else {
        for (var i = 0; i < apps.length; i++) {
            var app = apps[i];
            var curr_ = [app.min_pos(), app.cent_pos(), app.max_pos()];
            var curr = [[],[]];
            $.map(curr_, function(pair) {
                curr[0] = curr[0].concat(pair[0]);
                curr[1] = curr[1].concat(pair[1]);
            });
            tuple[0] = tuple[0].concat([curr[0].slice()]);
            tuple[1] = tuple[1].concat([curr[1].slice()]);
        };
        // Add in the root element. 
        // TODO: should be in apps
        var scroll_coord = 1;
        var max_height = $("body")[0].scrollWidth / s;
        if (scroll_coord)
            max_height = $("body")[0].scrollHeight / s;
        tuple[scroll_coord] = tuple[scroll_coord].concat([[0, max_height / 2, max_height]]);
        tuple[1 - scroll_coord] = tuple[1 - scroll_coord].concat([[0, 500, 1000]]);
    }

    var best_intervals = [];
    if (my_tuple[0][1])
        dist_cent = [my_tuple[0][1], my_tuple[1][1]];
    else
        var dist_cent = pos.slice();
    for (var coord = 0; coord <= 1; ++coord) {
        var best_snaps = {};
        var best_guides = {};
        var my_interval = [my_tuple[1 - coord][0], my_tuple[1 - coord][2]];
        if (my_interval[0] == undefined || my_interval[1] == undefined) {
            my_interval = dist_cent.slice()[1 - coord];
            my_interval = [my_interval, my_interval];
        }
        var best = { goal:0, strength:0, start:[0,0], end:[0,0] };
        for (var app_i = 0; app_i < tuple[coord].length; ++app_i) {
            for (var type1 = 0; type1 < 3; ++type1) {
                coord1 = my_tuple[coord][type1];
                if (!coord1)
                    continue;
                for (var type2 = 0; type2 < 3; ++type2) {
                    if (coord == scroll_coord && app_i == tuple[coord].length - 1
                        && type2 > 0)
                        break;
                    coord2 = tuple[coord][app_i][type2];
                    // Add padding if aligning a right edge to a left
                    var padding_factor = 0, added_padding = 0;
                    var padding_steps = 1;
                    if (Math.max(type2, type1) == 2 && 
                        Math.min(type1, type2) == 0) {
                        padding_factor = padding * o._sign(type2 - type1);
                        padding_steps = 2;
                    }
                    for (var j = 0; j < padding_steps; 
                        ++j, coord2 += padding_factor, 
                        added_padding += padding_factor) {
                        var snap_dist = Math.abs(coord2 - coord1);
                        if (snap_dist < snap_radius) {
                            var strength = 1.0;
                            var other_interval =
                                [tuple[1 - coord][app_i][0],tuple[1 - coord][app_i][2]];
                            var dist = o.interval_dist(my_interval, other_interval);
                            // power fall-off w/ decay when user jiggles mouse
                            var snap_dist_scaled = 1 - snap_dist / snap_radius;
                            strength *= Math.pow(snap_dist_scaled, sensitivity);
                            if (dist > 200) strength /= 
                                Math.exp((Math.min(dist, 1000) - 200)/500);
                            if ((type1 == 1) ^ (type2 == 1)) strength *= .4;
                            var goal = coord2 + pos[coord] - coord1;
                            // goal = Math.round(goal*2)/2;
                            goal_memo = precision(goal);
                            var total = best_snaps[goal_memo] || 0;
                            total += strength;
                            best_snaps[goal_memo] = total;
                            if (total > best.strength) {
                                best.strength = total;
                                best.goal = goal;
                            }
                            if (!show_guide[coord])
                                continue;
                            var guide = o.interval_bounds(my_interval, other_interval);
                            best_guides[goal_memo] = best_guides[goal_memo] || {};
                            // NOTE: We were showing the ruler at coord2 - added_padding
                            best_guides[goal_memo][type2] = 
                                o.interval_bounds(
                                    best_guides[goal_memo][type2] 
                                        || o.null_interval,
                                    guide).concat(coord2);
                        }
                    }
                }
            }
        }
        if (best.strength > snap_strength) {
            new_pos[coord] = best.goal;
            var obj = best_guides[precision(best.goal)];
            if (!obj)
                continue;
            // Just pick the first available guide matching the goal.
            // TODO-polish: pick on a more sensible criterion
            for (var first in obj)
                if (obj.hasOwnProperty(first)) break;
            if (obj[1])
                first = 1;
            best_intervals[coord] = obj[first];
        }
    }
    $(".ruler").hidehide();
    for (var coord = 0; coord < 2; ++coord) {
        if (best_intervals[coord]) {
            var best_interval = best_intervals[coord];
            var best = {start:[], end:[]};
            // Correct an interval which includes the original point pre-snap.
            // Fix it to the post-snap position.
            var orig_pos = [pos[1 - coord], my_tuple[1 - coord][2]];
            for (var i = 0; i < 2; i++) {
                if (orig_pos[i]) {
                    for (var j = 0; j < 2; j++) {
                        if (best_interval[j] == orig_pos[i])
                            best_interval[j] += new_pos[1 - coord] - pos[1 - coord];
                    }
                }
            }
            best.start[1 - coord] = best_interval[0];
            best.end[1 - coord] = best_interval[1];
            best.start[coord] = best_interval[2] - 2/s;
            best.end[coord] = best_interval[2];
            var klass = ".ruler.ruler" + coord;
            var rule = $(klass);
            if (0 == rule.length) {
                rule = $('<div class="ruler ruler' + coord + '">');
                rule.appendTo(env.apps_e)
            }
            rule.showshow();
            rule.css({
                left: Math.min(best.start[0], best.end[0]) * s,
                top: Math.min(best.start[1], best.end[1]) * s,
                width: Math.abs(best.start[0] - best.end[0]) * s,
                height: Math.abs(best.start[1] - best.end[1]) * s
            });
        }
    }
    return new_pos;
}

// TODO-color-picker: move into controls, add parameters for getter 
// and menu open (show) callback
o.append_color_picker = function(container, callback, init_color, opts){
    // opts = $.extend({iframe: false}, opts);
    var o = {}, init_color = init_color || '#000000',
        div = color_picker_template({colors:colors}),
        bar = div.find('.hue_bar'),
        shades = div.find('.shades'),
        manual_input = div.find('.color_input'),
        pickers = div.find('.color_select');

    var color_probe = $('#color_probe'), color_probe_0 = $('<div>')
    if(!color_probe.length)
        color_probe = $("<div id='color_probe'>").appendTo('body')
    var normalize = function(c){
        return color_probe_0.css('color', '').css('color', c).css('color') }
    var to_rgb = function(c){
        if (c.length == 3) return c;
        var c = normalize(c)
        if(!c) return [0,0,0]
        // this handles color names like "blue"
        return $.map(getComputedStyle(color_probe.css('color', c)[0]).color
            .replace(/[^\d,]/g,'').split(','), function(v){ return parseInt(v) });
    }, to_hex = function(color){
        if (typeof(color) == "string") color = to_rgb(color);
        return '#' + $.map(color, function(c) {
                var s = c.toString(16);
                return s.length == 1 ? '0' + s : s
            }).join('').toUpperCase();
    }, init_color = to_hex(init_color);

    pickers.each(function(i, el){
        el = $(el);
        var c = el.attr('val');
        el.click(function(ev){
            o.set_color(c);
            manual_input.val(c);
            callback(c, to_rgb(c));
        }).on('mousedown', function(e){ e.preventDefault()});
    });

    o.update_hex = function() {
        var v = manual_input.val();
        var c = normalize(v)
        if(!c){
            c = normalize('#'+v)
            if(!c && v) return
        }
        o.set_color(c, true)
        callback(c, to_rgb(c));
    };

    // saturated color picked from color bar
    var hsv = [0, 0, 1];
    var get_hue = function(e) {
        hsv[0] = bound(Math.floor(e.pageY - bar.offset().top) / bar.height(), 0, 1);
        shades.css('background-color', 'rgb(' + hsvToRgb(hsv[0], 1, 1).join(',') + ')');
        calc_color();
    };
    div.bind('mousewheel', function(e){
        // initialize()
        var amt = e.originalEvent.wheelDelta / 40
        if(!amt) return
        hsv[0] = js.bound(hsv[0] + amt/100, 0, 1)
        var c = calc_color()
        o.set_color(c);

        e.preventDefault()
    })


    o.set_color = function(color, manual){
        var rgb = to_rgb(color);
        hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        shades.css('background-color', 'rgb(' + hsvToRgb(hsv[0], 1, 1).join(',') + ')');
        if(rgb && !manual) manual_input.val(to_hex(color));
    };

    var get_shade = function(e) {
        var shades_size = shades.width()
        hsv[2] = bound((e.pageX - shades.offset().left) / shades_size, 0, 1);
        hsv[1] = bound((e.pageY - shades.offset().top) / shades_size, 0, 1);
        calc_color();
    };

    var calc_color = function() {
        var color = hsvToRgb(hsv[0], hsv[1], hsv[2]);
        var hex = to_hex(color);
        manual_input.val(hex);
        callback(hex, color);
        return color;
    }

    function hsvToRgb(h, s, v){
        var r, g, b;

        var i = Math.floor(h * 6);
        var f = h * 6 - i;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);

        switch(i % 6){
            case 0: r = v, g = t, b = p; break;
            case 1: r = q, g = v, b = p; break;
            case 2: r = p, g = v, b = t; break;
            case 3: r = p, g = q, b = v; break;
            case 4: r = t, g = p, b = v; break;
            case 5: r = v, g = p, b = q; break;
        }

        return $.map([r * 255, g * 255, b * 255], Math.round);
    }

    function rgbToHsv(r, g, b){
        r = r/255, g = g/255, b = b/255;
        var max = Math.max(r, g, b), min = Math.min(r, g, b);
        var h, s, v = max;

        var d = max - min;
        s = max == 0 ? 0 : d / max;

        if(max == min){
            h = 0; // achromatic
        }else{
            switch(max){
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }

        return [h, s, v];
    }

    // TODO: shades was undefined at some point.  Can't repro
    if(shades) shades.click(get_shade).drag(get_shade);
    bar.click(get_hue).drag(get_hue);
    o.set_color(init_color);

    manual_input.on('keyup input paste', function(e){
        // TODO-color-picker: make esc reset to color when last shown
        if (//e.keyCode == 27 ||                      // esc
            e.keyCode == 13)                        // enter
        {
            // Cancel edit, returning to initial color
            // Sadly, we don't actually have the initial color,
            // only the color when the drawer was created
            // if (e.keyCode == 27) {
            //     o.set_color(init_color);
            // }
            if (opts && opts.field_to_focus){
                opts.field_to_focus.focus();
            } else {
                manual_input.blur();
            }
        } else 
        o.update_hex()
    });

    // if (opts.iframe){
    //     o.input_frame(manual_input, div, {width: 124});
    // }

    container.append(div);

    return o;
};

var cursor_name
o.cursor_set = function(name){
    env.apps_e.add('#grid_guide').removeClass(cursor_name).addClass(name)
    cursor_name = name
}
//// END-editor-refactor


//// BEGIN-debugging
//// Convenience functions for interactive coding

o.sel = function(n) {
    if(!n) n = 0;
    return env.Selection.elements()[n];
}

o.foc = function(n){ env.Selection.update([env.Apps[n]]) };

// Rejigger the selected elements into their "best"
// snapped positions (and sizes TBD)
o.im_feeling_lucky = function(){
    var apps = env.Selection.elements();
    env.Selection.unfocus();
    $.map([100, 60, 40, 30, 20, 10], function(j) {
        // Randomize a bit
        $.map(apps, function(app, i){
            var pos = app.pos_relative();
            var rnd = [Math.random()*j/10-j/20, Math.random()*j/10-j/20];
            pos = o._add(rnd)(pos);
            app.pos_relative_set(pos);
        });
        $.map(apps, function(app, i){
            var pos = app.pos_relative();
            // var rnd = [Math.random()*6-3, Math.random()*6-3];
            // pos = o._add(rnd)(pos);
            var excludes = {};
            if(app.id) excludes[app.id] = true;
            pos = o.snap_helper(app.bounds_tuple_relative(pos), {
                exclude_ids: excludes,
                snap_strength: .05,
                snap_radius: j, });
            app.pos_relative_set(pos);
            // app.resize
        });
    });
    env.Selection.update(apps);
};

o.debug = function(a){
    1; // break
};

o.remove_all_apps = function() {
    // store a copy of Apps so we can destructively update it
    var apps = $.map(hive_app.Apps, id); 
    $.map(apps, function(a) { a.remove() });
};

// fuck me this is silly.
o.string_to_url = function(data, mime){
    var opts = {}
    if(mime) opts.type = mime
    var b = new Blob(data.split(''), opts)
    return URL.createObjectURL(b)
}


//// END-debugging
env.util = o
return o;

});
