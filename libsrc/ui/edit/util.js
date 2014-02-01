define([
    'browser/jquery'
    ,'browser/js'
    
    ,'server/context'
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
    ,Menu
    ,dialog

    ,env
){

var o = {}
    ,bound = js.bound;

// TODO-refactor: move into util

// Return -1 if x < 0, 1 if x > 0, or 0 if x == 0.
o._sign = function(x) {
    return typeof x === 'number' ? x ? x < 0 ? -1 : 1 : x === x ? 0 : NaN : NaN;
}

o._apply = function(func, scale) {
    if (typeof(scale) == "number") {
        return function(l) {
            return $.map(l, function(x) { return func(scale, x); });
        }
    } else {
        // TODO: error handling?
        return function(l) {
            if (typeof(l) == "number") {
                return $.map(scale, function(x, i) { return func(x, l); });
            } else {
                return $.map(l, function(x, i) { return func(scale[i], x); });
            }
        }
    }
};

o._mul = function(scale) {
    return o._apply(function(x, y){ return x * y; }, scale);
};
o._add = function(scale) {
    return o._apply(function(x, y){ return x + y; }, scale);
};
o._div = function(scale) {
    return o._apply(function(x, y){ return x / y; }, scale);
};
o._sub = function(scale) {
    return o._apply(function(a, b) { return a - b; }, scale);
};
o._inv = function(l){
    return l.map(function(x){ return 1/x; });
};
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

o.max = function(array){
    return Math.max.apply(Math, array);
};
o.min = function(array){
    return Math.min.apply(Math, array);
};

// Returns the nonnegative (nonoverlapping) distance btw two intervals.
o.interval_dist = function(a, b) {
    c = [a[1] - b[0], a[0] - b[1]];
    if (c[0] * c[1] <= 0)
        return 0;
    return Math.min(Math.abs(c[0]), Math.abs(c[1]));
};

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


o.array_delete = function(arr, e) {
    for(var n = 0; n < arr.length; n++) {
        if(arr[n] == e) {
            arr.splice(n, 1);
            return true;
        }
    }
    return false;
}
o.array_sum = function( a, b ){
    if (a.length != b.length) { throw "Arrays must be equal length" };
    rv = [];
    for (i=0; i< a.length; i++){
        rv[i] = a[i] + b[i]
    }
    return rv;
}

// used for app id
o.random_str = function(){ return Math.random().toString(16).slice(2); };


//// BEGIN-editor-refactor belongs in editor specific utils
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

// wrappers
o.hover_menu = function(handle, drawer, opts){
    return Menu(handle, drawer, $.extend({ auto_height: false }, opts));
};
o.show_dialog = function(jq, opts){
    var d = dialog.create(jq, opts);
    d.open();
    return d;
};

o.set_debug_info = function(info) {
    if (typeof(info) == "object")
        info = JSON.stringify(info).replace(/,/g,"\n")
    var $debug = $("#edit_debug");
    if ($debug.length == 0) {
        $debug = $("<div id='edit_debug' class='debug'</div>");
        $("body").append($debug);
    }
    if (info == "") {
        $debug.hidehide();
        return;
    }
    // TODO: option to put info over mouse
    $debug.showshow().css({ top: "0px", left: "0px" })
        .text(info);
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

    return $.map(files, function(file, i){
        var app = $.extend({ file_name: file.name, file_id: file.id,
            file_meta: file.meta }, opts);

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
        if (filter && !filter(app))
            return;

        return env.new_app(app, $.extend({ offset: [20*i, 20*i] }, app_opts) );
    });

    return false;
};

env.layout_apps = o.layout_apps = function(){
    env.scale_set();
    $.map(env.Apps, function(a){ a.layout() });
    if(env.Selection.controls) env.Selection.controls.layout();
    var height = Math.max(0, o.app_bounds(env.Apps.all()).bottom) * env.scale();
    $(".prompts").css("top", height);
    $(".prompts .highlight_box").css("width", 100*env.zoom() + "%");
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
        padding: 10,            // Editor units to add to object snapping against each other
        guide_0: true,          // show horizontal guide
        guide_1: true,          // show vertical guide
    }, opts );
    var s = env.scale(),
        exclude_ids = opts.exclude_ids,
        snap_strength = opts.snap_strength,
        snap_radius = opts.snap_radius,
        sensitivity = opts.sensitivity,
        padding = opts.padding,
        pos = [], show_guide = [];
    show_guide[0] = opts.guide_0;
    show_guide[1] = opts.guide_1;

    var left = 2;
    for (var j = 0; j < my_tuple[0].length; j++){
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
                rule.appendTo($("body"));
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

o.append_color_picker = function(container, callback, init_color, opts){
    // opts = $.extend({iframe: false}, opts);
    var o = {}, init_color = init_color || '#000000',
        div = color_picker_template(colors),
        bar = div.find('.hue_bar'),
        shades = div.find('.shades'),
        manual_input = div.find('.color_input'),
        pickers = div.find('.color_select');

    var to_rgb = function(c) {
        return $.map($('<div>').css('color', c).css('color')
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

    var hex_changed = false;
    o.update_hex = function() {
        if (!hex_changed) return;
        hex_changed = false;
        var v = manual_input.val();
        var c = $('<div>').css('color', v).css('color');
        callback(c, to_rgb(c));
    };

    // saturated color picked from color bar
    var hsv = [0, 0, 1];
    var get_hue = function(e) {
        hsv[0] = bound(Math.floor(e.pageY - bar.offset().top) / bar.height(), 0, 1);
        shades.css('background-color', 'rgb(' + hsvToRgb(hsv[0], 1, 1).join(',') + ')');
        calc_color();
    };

    o.set_color = function(color){
        var rgb = to_rgb(color);
        hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
        shades.css('background-color', 'rgb(' + hsvToRgb(hsv[0], 1, 1).join(',') + ')');
        manual_input.val(to_hex(color));
    };

    var get_shade = function(e) {
        hsv[2] = bound((e.pageX - shades.offset().left) / 120, 0, 1);
        hsv[1] = bound((e.pageY - shades.offset().top) / 120, 0, 1);
        calc_color();
    };

    var calc_color = function() {
        var color = hsvToRgb(hsv[0], hsv[1], hsv[2]);
        var hex = to_hex(color);
        manual_input.val(hex);
        callback(hex, color);
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

    shades.click(get_shade).drag(get_shade);
    bar.click(get_hue).drag(get_hue);
    o.set_color(init_color);

    // Prevent unwanted nudging of app when moving cursor in manual_input
    manual_input.on('mousedown keydown', function(e){
        hex_changed = true;
        e.stopPropagation();
    });

    manual_input.blur(o.update_hex).keypress(function(e){
        if(e.keyCode == 13) {
            if (opts && opts.field_to_focus){
                opts.field_to_focus.focus();
            } else {
                manual_input.blur();
            }
        }
    });

    // if (opts.iframe){
    //     o.input_frame(manual_input, div, {width: 124});
    // }

    container.append(div);

    return o;
};

//// END-editor-refactor


//// BEGIN-debugging
//// Convenience functions for interactive coding

o.sel = function(n) {
    if(!n) n = 0;
    return env.Selection.elements()[n];
}

o.foc = function(n){ env.Selection.update([env.Apps[n]]) };

o.rect_test = function(w, h){
    if(!w) w = 20;
    if(!h) h = 20;
    js.range(w).map(function(x){
        js.range(h).map(function(y){
            Hive.App({
                position: [x*50, y*50],
                dimensions: [48, 48],
                type: 'hive.rectangle',
                content: {color:colors[(x+y)%36]}
            })
        })
    });
};

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
    var aps = $.map(hive_app.Apps, id); 
    $.map(apps, function(a) { a.remove() });
};

//// END-debugging

return o;

});
