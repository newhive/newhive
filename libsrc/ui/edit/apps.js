// "use strict";
define([
    'jquery'
    ,'browser/js'
    ,'context'
    ,'browser/upload'
    ,'browser/layout'
    ,'browser/js'
    ,'ui/util'
    ,'ui/colors'
    ,'ui/codemirror/main'
    ,'ui/menu'

    ,'./env'
    ,'./util'
    ,'./events'
    // ,'./app_modifiers'

    ,'js!google_closure.js'
], function(
    $
    ,js
    ,context
    ,upload
    ,layout
    ,js_util
    ,ui_util
    ,colors
    ,CodeMirror
    ,menu

    ,env
    ,u
    ,evs
    // ,app_has
){
var Hive = {}
    ,noop = function(){}
    ,Funcs = js.Funcs
    ,asset = ui_util.asset
    ,memo = {}
;

var memoize = function(key, value) {
    if (!memo[key]) memo[key] = value
    return memo[key];
}
Hive.appTypes = { };
Hive.registerApp = function(app, name) {
    app.tname = name;
    Hive.appTypes[name] = app;
}

env.new_app = Hive.new_app = function(s, opts) {
    if(!opts) opts = {};
    var load = opts.load;
    opts.load = function(a) {
        // Hive.upload_finish();
        if (!s.position && !opts.position) {
            a.center_weird(s.center_offset);
            // Push images down to the bottom of the frame
            // if (a.type.tname == "hive.image") {
            //     var pos = a.pos_relative()
            //     var not_it = env.Apps.all().filter(function(x) { return a.id != x.id; });
            //     a.pos_relative_set([
            //         pos[0]
            //         ,env.padding() + Math.max(pos[1], u.app_bounds(not_it).bottom)
            //     ])
            // }
        }
        a.dims_set(a.dims());

        if(!opts.no_select) env.Selection.select(a);
        if(load) load(a);
        env.layout_apps() // in case scrollbar visibility changed
    };
    var app = Hive.App(s, opts);
    if(app.add_to_collection)
        env.History.save(app._remove, app._unremove, 'create');
    return app;
};

// TODO: root, selection, app inherits pseudoApp
// TODO-perf: ? For all inheritance, use prototype.

// PseudoApp cannot be added to selection
// It has no (server) state.
// Hive.PseudoApp = function(o) {
//     o = o || {}
//     o.is_pseudo_app = true

//     return o
// };
// Hive.registerApp(Hive.App.PseudoApp, 'hive.pseudo');

// Top of inheritance for editor objects
Hive.AppObject = function() {
    // Inhertance: javascript object
    var o = {}
    // Type definition
    // o.is_pseudo_app = true

    return o
};

Hive.Saveable = function(init_state) {
    // // prevent reentry
    // if (o && o.is_saveable)
    //     return o

    // Inheritance: editor object
    var o = Hive.AppObject()
    // Type definition
    o.is_saveable = true

    o.init_state = $.extend(true, {}, init_state || {})

    // getter and setter for state which is visible to history
    o.history_state = Funcs(function() {
        o.history_state.return_val = {}
    }) 
    o.history_state_set = Funcs(function(s) {
    })

    // getter and setter for state which is invisible to history
    o.state = Funcs(function() {
        var s = $.extend({}, o.init_state, o.history_state())
        o.state.return_val = s
    })
    o.state_update = Funcs(function(s) {
        $.extend(true, o.init_state, s)
        o.history_state_set(s)
    })

    return o
}

// id is (probabalistically) unique across editor
Hive.has_id = function(o) {
    if (!o.id && o.init_state && o.init_state.id)
        o.id = o.init_state.id
    o.id = o.id || u.random_str()

    if (!o.is_saveable) throw "has_id requires Saveable"
    o.state.add(function() {
        var s = { id: o.id }
        o.state.return_val = $.extend(o.state.return_val, s)
    })
}

// map [ name ==> obj id ]
var name_map = {}
// find next unused name with same base name
var unused_name = function(name) {
    var base = name, count = 0
        ,match = name.match(/_[0-9]+$/)
    if (match) {
        base = name.slice(0, -match[0].length)
        count = parseInt(match[0].slice(1))
    }
    while (name_map[name]) {
        ++count
        name = base + "_" + count
    }
    return name
}
// Give objects a numeric sequence name
Hive.has_sequence = function(o, typename) {
    var seq_type = typename || "object"
        ,name
        ,count = Hive.has_sequence[seq_type] || 0
    Hive.has_sequence[seq_type] = count + 1

    o.name = function() {
        return name
    }
    o.name_set = function(v) {
        if (name == v)
            return
        if (name)
            delete name_map[name]
        name = unused_name(v)
        name_map[name] = o.id
    }

    //////////////////////////////////////////////////////////////////
    // Saveable
    if (!o.is_saveable) throw "has_sequence requires Saveable"
    // getter and setter for state which is visible to history
    o.history_state.add(function() {
        var state = { name: o.name() }
        $.extend(o.history_state.return_val, state)
    }) 
    o.history_state_set.add(function(state) {
        if (state.name)
            o.name_set(state.name)
    })

    // initial state
    o.name_set((o.init_state && o.init_state.name) || seq_type + "_" + count)
}
// Have the sequence number saved/loaded globally for this expression
env.globals.has_sequence = function() {
    return $.extend({}, Hive.has_sequence)
}
env.globals_set.has_sequence = function(state) {
    return $.extend(Hive.has_sequence, state)
}


// This object has a location on canvas
Hive.has_location = function(o) {
    // TODO: organize all of the location functions
    // var dirty = false
    o.aabb = function() { return [[0, 0], [1, 1]] }
    o.aabb_set = function() {}
    o.pos_relative = function() { return o.aabb()[0] }
    o.pos_relative_set = function() {}
    o.dims_relative = function() { return u._sub(o.aabb()[1], o.aabb()[0]) }
    o.dims_relative_set = function() {}

    o.pos = function(){ return u._mul(o.pos_relative(), env.scale()) }
    o.pos_set = function(pos){
        o.pos_relative_set( u._div(pos, env.scale()) )
    };
    o.dims = function(){ return u._mul(o.dims_relative(), env.scale()) }
    o.dims_set = function(dims){
        o.dims_relative_set( u._div(dims, env.scale()) )
    };
    // o.width = function(){ return o.dims()[0] };
    // o.height = function(){ return o.dims()[1] };

    o.get_aspect = function() {
        var dims = o.dims_relative()
        return dims[0] / dims [1]
    }
}

// Grouping 
// This implements group functionality for groupable objects,
// abstractly for nodes, and concretely for leaves
Hive.has_group = function(o) {
    var parent
    o.parent = function() {
        return parent
    }
    // return a list of parent, parent's parent, etc.
    o.parents = function() {
        var parents = [o]
        if (parent)
            parents = parents.concat(parent.parents())
        return parents
    }
    o.parent_set = function(g) {
        // if (id && !Hive.Groups.fetch(id)) throw "parent group missing"
        parent = g
    }
    // return list of children
    o.children = function() {
        return []
    }
    // return list of leaf children
    o.children_flat = function() {
        return [o]
    }
    // return whether this is in the parents list of given child
    o.is_ancestor_of = function(child) {
        if (!child)
            return false
        if (child == o) 
            return true
        var parent = child.parent()
        return o.is_ancestor_of(parent)
    }
}

var g_groups = {}

Hive.Groups = function(state) {
    var o = Hive.Saveable(state)
    o.is_group = true

    Hive.has_group(o)
    Hive.has_location(o)
    Hive.has_id(o)
    Hive.has_sequence(o, "group")

    var children_ids = []
    g_groups[o.id] = o

    //////////////////////////////////////////////////////////////
    // Saveable
    o.state_update.add(function(state) {
        children_ids = state.children_ids || children_ids
        children_ids = children_ids.slice()
        if (state.has_group_layout) {
            if (state.alignment) {
                has_group_align(o, state.alignment)
            }
        }
    })
    o.state.add(function() {
        var s = { children_ids: o.children_ids_existing() }
        $.extend(o.state.return_val, s)
    })
    //////////////////////////////////////////////////////////////

    //////////////////////////////////////////////////////////////
    // has_group
    o.children = function() {
        return $.map(children_ids, function(id) { 
            return env.Apps.app_or_group(id) || []
        })
    }
    o.children_flat = function() {
        var apps = [], children = o.children()
        children.map(function(app_or_group) {
            apps = apps.concat(app_or_group.children_flat())
        })
        return apps
    }
    //////////////////////////////////////////////////////////////

    //////////////////////////////////////////////////////////////
    // TODO: break all location functions into child class
    // TODO: cache and clear dirty bit
    o.aabb = function(opts) {
        opts = $.extend({exclude: {}}, opts)
        var children_aabb = $.map(o.children(), function(child) {
            if (opts.exclude[child.id]) return []
            return [child.aabb()]
        })
        var nw = u._min.apply(0, u.nth(children_aabb, 0))
            ,se = u._max.apply(0, u.nth(children_aabb, 1))
        return [nw, se]
    }
    o.aabb.dirty = true
    o.aabb_set = function(_aabb) {
        // TODO: integrate with selection
        var aabb = o.aabb()
        var scale = u._div(u._sub(_aabb[1], _aabb[0]), u._sub(aabb[1], aabb[0]))
        var rescale = function(pt) {
            return pt.map(function(p, coord) {
                return (p - aabb[0][coord]) * scale[coord] + _aabb[0][coord]
            })
        }
        $.map(o.children(), function(child) {
            var child_aabb = child.aabb()
            child.aabb_set(child_aabb.map(rescale))
        })
    }
    //////////////////////////////////////////////////////////////

    // This group, and all its children, recursively down to leaves
    o.children_all = function() {
        return $.map(o.children(), function(child) {
            if (!child.is_group)
                return []
            return child.children_all()
        }).concat(o)
    }
    // id's of children
    o.children_ids = function() {
        return children_ids.slice()
    }
    // id's of children which exist and are not deleted
    o.children_ids_existing = function() {
        return $.map(o.children(), function(child) {
            if (child && !child.deleted)
                return child.id
            return []
        })
    }
    // add child to this group
    o.add_child = function(app_or_group_or_id) {
        var id = app_or_group_or_id.id || app_or_group_or_id
        children_ids.push(id)
        var g = env.Apps.app_or_group(id)
        if (g) {
            var parent = g.parent()
            if (parent)
                parent.remove_child(g)
            g.parent_set(o)
        }
    }
    // remove child from this group
    o.remove_child = function(app_or_group_or_id) {
        var id = app_or_group_or_id.id || app_or_group_or_id
        var index = children_ids.indexOf(id)
        if (index > -1) {
            children_ids.splice(index, 1)
            var app_or_group = env.Apps.app_or_group(id)
            app_or_group.parent_set(null)
        }
    }
    // Disband this group, setting all of its children to be children
    // of {parent} or of its parent if unspecified
    o.ungroup = function(new_parent) {
        var children = o.children()
            , parent = (new_parent != undefined) ? new_parent : o.parent()
        children.map(function(child) { 
            o.remove_child(child) 
            if (parent)
                parent.add_child(child)
        })
        if (parent)
            parent.remove_child(o.id)
        // delete g_groups[o.id]
        // TODO: group/ungroup history
        return children
    }

    if (state) // init
        o.state_update(state)
    return o
}
// Find the (lowest) common parent in list of groups / apps
Hive.Groups.common_parent = function(groups) {
    if (groups.length == 0)
        return undefined
    var parents = groups[0].parents()
        , common_parent = groups[0]
    for (var i = 1; i < groups.length && parents.length; ++i) {
        var group = groups[i]
        var new_parents_ids = group.parents().map(function(g) {return g.id})
        while (parents.length) {
            if (new_parents_ids.indexOf(parents[0].id) >= 0)
                break;
            parents.splice(0, 1)
        }
    }
    return parents[0]
}
Hive.Groups.fetch = function(id) {
    return g_groups[id]
}
Hive.Groups.state = function() {
    return $.map(g_groups, function(g, id) {
        // Do not save empty (orphaned) groups
        return g.children_ids_existing().length ? g.state() : []
    })
}
Hive.Groups.init = function(states) {
    states.map(function(state) {
        Hive.Groups(state)
    })
    // Now fix up the parent pointers
    $.each(g_groups, function(id, g) {
        $.each(g.children(), function(i, child) {
            if (child)
                child.parent_set(g)
        })
    })
}
env.Groups = Hive.Groups

// Generic layout group class
var has_group_layout = function(o) {
    if (!o.is_group) throw "Not a group"
    if (o.has_group_layout) return // reentrant
    o.has_group_layout = true

    //////////////////////////////////////////////////////////////
    // Saveable
    o.state.add(function() {
        var s = { has_group_layout: true }
        $.extend(o.state.return_val, s)
    })
    //////////////////////////////////////////////////////////////

    // Called by children when they move around
    o.on_child_modification = function(child) {
        if (o.on_child_modification.semaphore)
            return
        if (child && !o.is_ancestor_of(child)) {
            console.log("Error: on_child_modification called for no reason")
            return
        }
        o.on_child_modification.semaphore = true
        o._on_child_modification(child)
        o.on_child_modification.semaphore = false
    }
    // abstract function to be defined by inherited classes
    o._on_child_modification = function(child) {}
}
var realign = function(children, alignment, aabb, opts) {
    opts = $.extend({stack: -1, padding: 10}, opts)
    var stack = opts.stack, padding = opts.padding
        ,outer_dims = u.aabb2pos_dims(aabb)[1]
    if (stack >= 0 && alignment[stack] == -1) {
        var pos = opts.pos || aabb[0].slice()
            , dims_total = [0, 0], dims_min = [Infinity, Infinity]
        children = children.sort(function(a, b) {
            return a.pos_relative()[stack] - b.pos_relative()[stack]
        })
        $.map(children, function(child) {
            var dims = child.dims_relative()
            dims_total = u._add(dims_total, dims)
            dims_min = u._min(dims_min, dims)
        })
        // Auto padding distributes padding evenly (justify)
        if (padding == "auto" && children.length > 1) {
            padding = (outer_dims[stack] - dims_total[stack]) / (children.length - 1)
        }
        // Don't allow stacking if it would change children order
        if (padding < -dims_min[stack])
            stack = -1
    }
    $.map(children, function(child) {
        var child_aabb = child.aabb()
        for (var coord = 0; coord < 2; ++coord) {
            var shift = 0
            if (alignment[coord] < 0) {
                if (stack != coord)
                    continue
                var size = child_aabb[1][coord] - child_aabb[0][coord]
                child_aabb[0][coord] = pos[coord]
                child_aabb[1][coord] = pos[coord] + size
                pos[coord] += size + padding
                continue
            } else if (alignment[coord] == 3) {
                child_aabb[0][coord] = aabb[0][coord]
                child_aabb[1][coord] = aabb[1][coord]
                var aspect = child.get_aspect();
                if (aspect) {
                    if (!coord) aspect = 1 / aspect;
                    var size = aabb[1][coord] - aabb[0][coord]
                    var old_size = child_aabb[1][1 - coord] - child_aabb[0][1 - coord]
                    child_aabb[0][1 - coord] += .5 * (old_size - size * aspect)
                    child_aabb[1][1 - coord] = child_aabb[0][1 - coord] + size * aspect
                }
                // else if (app.is_selection && app.count() == 1) {
                //     app = app.elements()[0];
                //     dims[1 - coord] = app.dims_relative()[1 - coord];
                // }

                continue
            } else if (alignment[coord] == 0) {
                shift = aabb[0][coord] - child_aabb[0][coord]
            } else if (alignment[coord] == 1) {
                shift = aabb[1][coord] - child_aabb[1][coord]
            } else if (alignment[coord] == 2) {
                shift += aabb[0][coord] - child_aabb[0][coord]
                shift += aabb[1][coord] - child_aabb[1][coord]
                shift *= .5
            }
            child_aabb[0][coord] += shift
            child_aabb[1][coord] += shift
        }
        child.aabb_set(child_aabb)
    })
}
// Group whose children are all aligned (left/right/top/bottom/center/justified)
var has_group_align = function(o, alignment) {
    has_group_layout(o)
    // for each coordinate, -1 == none, 0 = minimum, 1 = maximal, 2 = center, 3 = justify
    var alignment = alignment || [0, -1]
    var stack = -1
    var padding = 10

    //////////////////////////////////////////////////////////////
    // Saveable
    var state_update = o.state_update.add(function(state) {
        state.alignment && o.alignment_set(state.alignment)
        state.layout_stack && (stack = state.layout_stack)
        state.layout_padding != undefined && (padding = state.layout_padding)
    })
    o.state.add(function() {
        var s = { alignment: alignment
            , layout_stack: stack
            , layout_padding: padding 
        }
        $.extend(o.state.return_val, s)
    })
    //////////////////////////////////////////////////////////////

    o.alignment_set = function(_alignment) {
        if (u.deep_equals(alignment, _alignment))
            return
        alignment = _alignment.slice()
        // force re-layout
        o.on_child_modification()
    }
    o._on_child_modification = function(child) {
        // find current bounds
        var exclude = {}
        if (child)
            exclude[child.id] = 1
        var aabb = o.aabb({exclude: exclude})
            , children = o.children()
            opts = {stack: stack, padding: padding}
        if (stack >= 0 && alignment[stack] == -1) {
            opts.pos = o.aabb()[0].slice()
        }
        return realign(children, alignment, aabb, opts)
    }
    state_update(o.init_state)
}
//!! TESTING
env.has_group_align = function(o, alignment) {
    has_group_align(o)
    if (alignment) 
        o.alignment_set(alignment)
}

// collection object for all App objects in page. An App is a widget
// that you can move, resize, and copy. Each App type has more specific
// editing functions.
env.Apps = Hive.Apps = (function(){
    var o = [], apps = {};

    o.state = function() {
        return $.map(o.all(), function(app) { return app.state(); });
    };

    var defer_layout = false, in_layout = false
    o.defer_layout = function() {
        return defer_layout }
    o.begin_layout = function() { 
        defer_layout = true
    }
    o.end_layout = function() { 
        // if (in_layout)
        //     return
        in_layout = true
        defer_layout = false
        var apps = o.all()
        apps.push(env.Selection)
        // performance experiment: would the css update faster if not on 
        // the DOM? Turns out no.
        // var controls = $("#controls").remove()
        $.map(o.all(), function(app) { 
            if(app.needs_layout) {
                app.layout()
            }
        })
        in_layout = false
        // controls.appendTo("#controls_group")
    }

    o.dims = function(){
        var dims = [0, 0]
        o.all().map(function(a){
            dims = u._apply(Math.max, u._add(a.pos(), a.dims()), dims)
        })
        return dims
    }
    o.dims_relative = function(){
        var dims = [0, 0]
        o.all().map(function(a){
            dims = u._apply(Math.max, u._add(a.pos_relative(),
                a.dims_relative()), dims)
        })
        return dims
    }

    var stack = []
    u.has_shuffle(stack);
    o.restack = function(include_deletes){
        var c_layer = 0
        for(var i = 0; i < stack.length; i++){
            if(!stack[i] || !include_deletes && stack[i].deleted)
                continue
            stack[i].layer_set(c_layer)
            c_layer++
        }
    }
    o.stack = function(from, to){
        stack.move_element(from, to);
        o.restack(true);
    };
    o._stack = stack;
    
    o.add = function(app) {
        var i = o.length;
        o.push(app);

        if(typeof(app.layer()) != 'number') {
            app.layer_set(stack.length);
            stack.push(app);
        // if there's already an app at this layer, splice in the new app one layer above
        } else if( stack[app.layer()] ) {
            stack.splice(app.layer() + 1, 0, app);
            o.restack(true)
        } else // This case is on expression load
            stack[app.layer()] = app;
        apps[app.id] = app
        return i;
    };
    o.copy_groups = function(groups, opts) {
        var elements = $.map(groups, function(g) {
            return g.children_flat()
        })
        // copy children in layer order so sort is consistent
        elements = elements.sort(function(a,b) {
            return a.layer() - b.layer()
        });
        opts.z_index = "top"; // NaN goes to top
        // map [ original app/group ==> copied app/group ]
        var child_map = {}
        var copies = $.map(elements, function(e){
            var child = e.copy(opts)
            child_map[e.id] = child.id
            return child
        });
        var old_groups = $.map(groups, function(g) {
            if (!g.is_group)
                return []
            return g.children_all()
        })
        // copy the groups sans children
        var group_copies = $.map(old_groups, function(g, i) {
            if (!g.is_group)
                return []
            var state = g.state()
            delete state.children_ids
            delete state.id
            var new_group = Hive.Groups(state)
            child_map[g.id] = new_group.id
            return new_group
        })
        // put the children back into the copied groups
        $.each(child_map, function(old_id, new_id) {
            var old_child = o.app_or_group(old_id)
                ,new_child = o.app_or_group(new_id)
                ,old_parent = old_child.parent()
            if (!old_parent) 
                return
            var new_parent = o.app_or_group(child_map[old_parent.id])
            if (new_parent) new_parent.add_child(new_child)
        })
        return copies
    }
    o.by_name = function(name) {
        var id = name_map[name] || name
        return o.fetch(id)
    }
    o.fetch = function(id){
        return apps[id]
    };
    o.app_or_group = function(id) {
        return apps[id] || Hive.Groups.fetch(id)
    }
    o.all = function(){ return $.grep(o, function(e){ return ! e.deleted; }); };
    o.filtered = function(filter) { return $.grep(o, filter); };
    o.init = function(initial_state, load){
        stack.splice(0);
        o.splice(0);

        if(!load) load = noop;
        
        if(!initial_state) initial_state = [];
        var load_count = initial_state.length;
        var load_counter = function(){
            load_count--;
            if(!load_count) load();
        };
        $.map(initial_state, function(e){ 
            var app = Hive.App(e, { load: load_counter }) 
        } );
    };

    return o;
})();


// Creates generic initial object for all App types.
Hive.App = function(init_state, opts) {
    var o = Hive.Saveable(init_state)
    o.is_app_object = true
    o.apps = Hive.Apps;
    if(!opts) opts = {};

    o.initialized = false;    
    o.init_state = { z: null };
    $.extend(o.init_state, init_state);
    o.type = Hive.appTypes[init_state.type];
    o.handler_type = 0;
    o.make_controls = [];

    Hive.has_group(o)
    Hive.has_id(o)
    o.typename = function() {
        return o.type.tname.replace("hive.", "")
    }

    o.css_state = {};
    o.content = function(content) { return $.extend({}, o.css_state); };
    o.set_css = function(props) {
        $.extend(o.css_state, props);
        // These properties are set in view mode, but should never be set in edit.
        delete props.position
        delete props.visibility
        o.content_element.css(props);
        if(o.controls) o.controls.layout();
    }
    o.css_getter = function(css_prop){ return function(){
        return o.css_state[css_prop] } }
    o.css_setter = function(css_prop, suffix) { 
        suffix = suffix || ""
        return function(v) {
            var ps = {}; ps[css_prop] = v + suffix; o.set_css(ps);
        }
    }
    o.css_setter_px = function(css_prop) { return o.css_setter(css_prop, 'px') }

    // Generic setters and getters
    o.gcolor = function(){ return o.css_state['background-color'] || '' };
    o.gcolor_set = o.css_setter('background-color');
    o.gstroke = function(){ return o.css_state['border-color'] || '#000' };
    o.gstroke_set = o.css_setter('border-color');
    o.gborder_width = function(){ return parseInt(o.css_state['border-width'] || 0) };
    o.gborder_width_set = function(v) {
        o.css_setter_px('border-width')(v);
        if (env.Selection.controls)
            o.fixup_border_controls(env.Selection.controls);
        o.layout();
    }
    o.fixup_border_controls = function(o) {
        var has_border = false
        env.Selection.each(function(i, a) {
            has_border |= (a.border_width && a.border_width() > 0)
        })
        o.div.find('.buttons .button.stroke').showhide(has_border);
    };
    o.fixup_border_controls.display_order = 9;
    o.make_controls.push(memoize("o.fixup_border_controls", 
        o.fixup_border_controls));

    var _client_data = function() {
        o.init_state.client_data = o.init_state.client_data || {};
        return o.init_state.client_data;
    }
    o.client_data = function(key) { return _client_data()[key]; }
    o.client_data_set = function(key, value) {
        _client_data()[key] = value;
        o.div.data(key, value);
    }

    // This app, or the selected app if this is the selection
    o.sel_app = function() {
        if (o.is_selection && o.count() == 1)
            return o.elements(0);
        return o;
    }

    o._remove = function(){
        o.unfocus();
        env.Selection.unfocus(o);
        o.div.hidehide();
        o.deleted = true;
        if(o.controls) o.controls.remove();
    };
    o._unremove = function(){
        o.div.showshow();
        o.deleted = false;
    };
    o.remove = function(){
        o._remove();
        env.History.save(o._unremove, o._remove, 'delete');
    };

    // stacking order of apps
    var layer = init_state.z;
    o.layer = function(){ return layer; };
    o.layer_set = function(n){
        layer = n;
        o.div.css('z-index', n);
    };
    var stack_to = function(i){ o.apps.stack(o.layer(), i); };
    o.stack_to = function(to){
        var from = o.layer();
        if(from == to) return;
        env.History.saver(o.layer, stack_to, 'change layer').exec(to);
    };
    o.stack_bottom = function(){
        o.stack_to(0) };
    o.stack_top = function(){
        o.stack_to(o.apps.length -1) };
    
    var focused = false;
    o.focused = function() { return focused };
    o.focus = Funcs(function() {
        if(focused) return;
        focused = true;
        evs.handler_set(o);
    }, function(){ return !o.focused()} );
    o.unfocus = Funcs(function() {
        if(!focused) return;
        focused = false;
        evs.handler_del(o);
    }, o.focused);

    // BEGIN-coords: client space and editor space (called relative)
    // position and dimension methods

    var _pos = [-999, -999], _dims = [-1, -1];

    o.get_aspect = function() { return false; };
    o.current_aspect = function() { 
        var aabb = o.aabb(), dims = u._sub(aabb[1], aabb[0])
        return dims[0] / dims[1]
    }
    o.has_full_bleed = function() { return false; };
    o.angle = function(){ return 0; };
    o.pos = function(){ return u._mul(_pos, env.scale()) }
    o.pos_set = function(pos){
        var s = env.scale();
        o.pos_relative_set( [ pos[0] / s, pos[1] / s ] );
    };
    o.dims = function(){ return u._mul(_dims, env.scale()) }
    o.dims_set = function(dims){
        var s = env.scale();
        o.dims_relative_set( [ dims[0] / s, dims[1] / s ] );
    };
    o.width = function(){ return o.dims()[0] };
    o.height = function(){ return o.dims()[1] };
    o.pos_center = function() {
        var dims = o.dims();
        var pos = o.pos();
        return [ pos[0] + dims[0] / 2, pos[1] + dims[1] / 2 ];
    };

    var full;
    o.full = function(){ return full }
    o.full_set = function(v){
        full = Boolean(v)
        o.div.toggleClass('full', full)
    }

    var hidden_controls = false;
    o.hide_controls = function(){
        if(!o.controls) return
        hidden_controls = o.controls
        o.controls.fixed_div.hidehide()
        o.controls = false
    }
    o.show_controls = function(){
        if(!hidden_controls) return
        if(o.controls){
            // discard the controls that were replaced while hidden
            hidden_controls.remove()
            return
        }
        o.controls = hidden_controls
        hidden_controls = false
        o.controls.fixed_div.showshow()
        o.controls.layout()
    }

    var css_ify = function(k) { return Math.max(1, Math.round(k)) }
    // why isn't this all in o.layout?
    o.special_layout = function() {
        if (o.zoom_fit()) {
            var opts = { fit:o.zoom_fit()
                , pos:[0, 0], dims: [1000,1000*$(window).height()/$(window).width()]}
            o.fit_to(opts)
            // why not use CSS position:fixed?
            if (o.is_fixed()) {
                o.pos_set(u._add(o.pos(), env.scroll))
            }
        }
    }
    o.zoom_fit = function() { return o.init_state.fit }
    var in_layout = false
    o.layout = function(pos, dims){
        if (Hive.Apps.defer_layout()) {
            o.needs_layout = true;
            return true;
        }
        if (in_layout)
            return
        in_layout = true
        // TODO: have dirty bit
        if (o.initialized)
            $.map(o.parents(), function(g) {
                if (g.has_group_layout)
                    g.on_child_modification(o)
            })
        o.needs_layout = false;
        (o.special_layout())
        var pos = pos || o.pos(), dims = dims || o.dims();
        u.inline_style(o.div[0], { 'left' : pos[0], 'top' : pos[1] 
            // rounding fixes SVG layout bug in Chrome
            ,width: css_ify(dims[0]), height: css_ify(dims[1])});
        if(o.controls)
            o.controls.layout();
        // If this app == selection, update selection. 
        if(env.Selection && u.array_equals(env.Selection.elements(), [o])) {
            env.Selection.update_relative_coords();
        }
        in_layout = false
    };

    o.pos_relative = function(){ return _pos.slice(); };
    o.pos_relative_set = function(pos){
        // if (u.array_equals(_pos, pos))
        //     return
        _pos = pos.slice();
        o.layout()
    };
    o.dims_relative = function(){
        return _dims.slice();
    }
    o.dims_relative_set = function(dims){
        // if (u.array_equals(_dims, dims))
        //     return
        _dims = dims.slice();
        o.layout();
    };
    o.bounds_relative_set = function(pos, dims) {
        _pos = pos.slice();
        _dims = dims.slice();
        o.layout();
    }
    o.aabb = function() {
        return [o.min_pos(), o.max_pos()]
    }
    o.aabb_set = function(aabb) {
        var my_aabb = o.aabb(), aabb = aabb.slice()
        my_aabb[1] = u._sub(my_aabb[1], my_aabb[0])
        aabb[1] = u._sub(aabb[1], aabb[0])
        o.pos_relative_set( u._add(o.pos_relative(),  u._sub(aabb[0], my_aabb[0])))
        o.dims_relative_set(u._add(o.dims_relative(), u._sub(aabb[1], my_aabb[1])))
    }
    o.pos_center_relative = function(){
        var dims = o.dims_relative();
        var pos = o.pos_relative();
        return [ pos[0] + dims[0] / 2, pos[1] + dims[1] / 2 ];
    };
    var _min_pos = function(){ return o.pos_relative(); };
    var _max_pos = function(){ return u._add(o.pos_relative())(o.dims_relative()) };
    o.pts = function() {
        var _min = _min_pos(), _max = _max_pos(), r = o.angle()
            ,_cen = u._mul(.5)(u._add(_min)(_max))
            ,mtx = [_min, _max], corners = [];
        for (var x = 0; x < 2; ++x) {
            for (var y = 0; y < 2; ++y) {
                var pt = [mtx[x][0], mtx[y][1]]
                if (!r)
                    corners.push(pt)
                else
                    corners.push(u.rotate_about(pt, _cen, u.deg2rad(r)));
            }
        }
        return corners;
    }
    // These two return axis aligned bounding box (when rotated, etc)
    o.max_pos = function() {
        var c = o.pts();
        return [Math.max.apply(null, u.nth(c, 0)),
                Math.max.apply(null, u.nth(c, 1))];
    }
    o.min_pos = function() {
        var c = o.pts();
        return [Math.min.apply(null, u.nth(c, 0)), 
                Math.min.apply(null, u.nth(c, 1))];
    }
    o.cent_pos = function() { return u._mul(.5)(u._add(o.min_pos())(o.max_pos())); };
    // return [[x-min, x-center, x-max], [y-min, y-center, y-max]]
    // if o were moved to pos
    o.bounds_tuple_relative = function(pos) {
        var curr_ = [o.min_pos(), o.cent_pos(), o.max_pos()]
            ,del = u._sub(o.min_pos())(o.pos_relative());
        // curr_ = curr_.map(function(x) { return u._sub(x)(del) });
        var curr = [[],[]];
        $.map(curr_, function(pair) {
            curr[0] = curr[0].concat(pair[0] + pos[0] - _pos[0]);
            curr[1] = curr[1].concat(pair[1] + pos[1] - _pos[1]);
        });
        return [curr[0].slice(), curr[1].slice()];
    }

    o.centroid = function() {
        return u._mul(env.scale())(o.centroid_relative()) }
    o.centroid_relative = function(){
        var ps = o.pts()
            ,sum = ps.reduce(function(p1, p2){ return u._add(p1)(p2) })
        return u._div(sum)(ps.length)
    }

    // END-coords

    o.center_weird = function(offset) {
        var win = $(window),
            pos = [ ( win.width() - o.width() ) / 2 + win.scrollLeft(),
                ( win.height() - o.height() ) / 2 + win.scrollTop() ];
        if(typeof(offset) != "undefined"){ pos = u._add(pos)(offset) };
        o.pos_set(pos);
    };

    o.center_relative_set = function(center){
        o.pos_relative_set(u._sub(center)(u._div(o.dims_relative())(2))) }

    o.copy = function(opts){
        if(!opts) opts = {};
        var app_state = $.extend({}, true, o.state());
        delete app_state.id;
        if(opts.z_offset) app_state.z += opts.z_offset;
        var cp = Hive.App(app_state, opts);
        env.History.save(cp._remove, cp._unremove, 'copy');
        return cp;
    };

    // opts.doit: true to move and resize the object
    // opts.pos, opts.dims: the pos/dims of the object you are fitting to
    // opts.scaled: (optional): dimensions of intrinsic, clipped object
    o.fit_to = function(opts){
        if (opts.doit == undefined) opts.doit = true;
        var dims = opts.dims.slice(), pos = opts.pos.slice();
        var scaled = (opts.scaled) ? opts.scaled.slice() : o.dims();
        var aspect = scaled[1] / scaled[0];
        var into_aspect = dims[1] / dims[0];
        var fit_coord = (aspect < into_aspect) ? 0 : 1;
        if (opts.zoom || opts.fit == 2)
            fit_coord = 1 - fit_coord;
        scaled = u._mul(dims[fit_coord] / scaled[fit_coord])(scaled);
        pos[1 - fit_coord] += 
            (dims[1 - fit_coord] - scaled[1 - fit_coord]) / 2;

        if (opts.doit) {
            o.pos_relative_set(pos);
            o.dims_relative_set(scaled);
        }
        return { pos: pos, dims: scaled };
    };
    o.highlight = function(opts) {
        opts = opts || {};
        opts = $.extend({on: true}, opts);

        var $highlight = o.div.find(".highlight");
        if(!$highlight.length){
            $highlight = $("<div class='highlight hide'></div>")
            $highlight.appendTo(o.content_element || o.div)
        }
        $highlight.showhide(opts.on);
    }
    o.is_fixed = function() { return o.fixed && o.fixed() }

    /////////////////////////////////////////////////////////////////////////
    // Saveable
    // TODO-cleanup-history: use state instead
    // Hive.Saveable(o)
    o.history_state.add(function() {
        var pos_dims = {
            position: _pos.slice(),
            dimensions: _dims.slice()
        }
        if (o.is_fixed())
            pos_dims.position = 
                u._sub(pos_dims.position, 
                    u._div(env.scrollY, env.scale()))
        $.extend(o.history_state.return_val, pos_dims)
    })
    o.state_relative = function(){
        return o.history_state()
    }
    o.history_state_set.add(function(s){
        if(s.position) {
            _pos = s.position.slice();
            if (o.is_fixed())
                _pos = u._add(_pos,
                    u._div(env.scroll[0], env.scale()))
        }
        if(s.dimensions)
            _dims = s.dimensions.slice();
    })
    o.state_relative_set = function(s){
        o.history_state_set(s)
        o.layout();
    };

    o.state.add(function(){
        var s = { z: o.layer() }
        if(o.full_coord) 
            s.full_bleed_coord = o.full_coord
        if(o.content) 
            s.content = o.content()
        // if(Object.keys(o.css_state).length)
            s.css_state = $.extend({}, o.css_state);
        $.extend(true, o.state.return_val, s);
    });
    o.state_update.add(function(s) {
        o.state_relative_set(s);
    });
    /////////////////////////////////////////////////////////////////////////

    o.css_class = function(){
        return o.init_state.css_class || "" }
    o.css_class_set = function(s){
        o.div.removeClass(o.css_class()).addClass(s)
        o.init_state.css_class = s
    }
    o.css_class_get_all = function() {
        return o.css_class().split(" ")
    }
    o.css_class_add = function(s){
        s = h.u.union(o.css_class().split(" "), s.split(" ")).join(" ")
        o.css_class_set(s);
    }
    o.css_class_remove = function(s){
        s = h.u.except(o.css_class().split(" "), s.split(" ")).join(" ")
        o.css_class_set(s);
    }

    o.load = Funcs(function() {
        if( ! o.init_state.position ) o.init_state.position = [ 100, 100 ];
        if( ! o.init_state.dimensions ) o.init_state.dimensions = [ 300, 200 ];
        if( opts.offset )
            o.init_state.position = u._add(o.init_state.position)(opts.offset);
        o.state_relative_set(o.init_state);
        if (o.init_state.full_bleed_coord != undefined)
            Hive.App.has_full_bleed(o, o.init_state.full_coord);
        o.initialized = true;
        if(opts.load) opts.load(o);
    });

    // initialize

    o.div = $('<div class="happ drag">').appendTo(env.apps_e)
    if (o.init_state.client_data) 
        o.div.data(o.init_state.client_data)
    o.css_class_set(o.css_class())

    o.has_align = o.add_to_collection = o.client_visible = true;

    o.type(o); // add type-specific properties
    opts.defer_load != undefined && (o.defer_load = opts.defer_load)
    if (o.initialized) throw "load called too soon"
    Hive.has_sequence(o, o.typename())
    o.div.attr('id', o.name())

    o.div.addClass(o.type.tname.replace(".", "_"))
    if (o.content_element && o.init_state.css_state)
        o.set_css(o.init_state.css_state);
    if (o.has_align)
        Hive.App.has_align(o);
    if (o.add_to_collection) {
        o.apps.add(o); // add to apps collection
        Hive.App.has_fixed(o).display_order = 8
    }
    // Add the currently active controls from editor extensions
    o.make_controls = o.make_controls.concat(active_controls)
    if (o.client_visible && o.add_to_collection && context.flags.css_classes) {
        var history_point, sel = env.Selection
        Hive.App.has_text_menu(".css_classes", {
            filter: function(app) { return env.show_css_class }
            , app: o
            , start: function(){ history_point = env.History.saver(
                sel.css_class, sel.css_class_set, 'css classes'); }
            , end: function(){ history_point.save() }
            , init: sel.css_class_sel
            , set: sel.css_class_sel_set
        }).controls.display_order = 8
    }
    // TODO-cleanup-events: attach app object to these events on app div without
    // creating duplicate event handlers, allowing for easier overriding
    evs.on(o.div, 'dragstart', o, {bubble_mousedown: true, handle: '.drag'})
        .on(o.div, 'drag', o, {handle: '.drag'})
        .on(o.div, 'dragend', o)
        .on(o.div, 'mousedown', o)
        .on(o.div, 'mouseup', o)
        // .long_hold(o.div, o);
    if (!o.defer_load)
        setTimeout(o.load, 1);
    return o;
};
Hive.registerApp(Hive.App, 'hive.app');

// This App shows an arbitrary single HTML tag.
Hive.App.Html = function(o) {
    Hive.App.has_resize(o)

    o.content = function(){
        return o.content_element[0].outerHTML }
    o.content_set = function(v){
        var new_content = $(v)
        o.content_element.replaceWith(new_content)
        o.content_element = new_content
    }

    var content = o.init_state.content;
    // TODO: turn off autoplay when editing.
    // m = content.match(/(.*youtube.*)&amp;autoplay=1(.*)/);
    // if (m)
    //     content = m[1] + m[2];
    o.content_element = $(content).addClass('content');
    o.div.append(o.content_element);
    if(    o.content_element.is('object')
        || o.content_element.is('embed')
        || o.content_element.is('iframe'))
    {
        Hive.App.has_shield(o)//, {always: true});
        o.click_to_unshield = function() { return o.focused(); }
        o.set_shield = function(){ return true; }
        o.shield();
    }

    var text_editor = $('<textarea>').addClass('content').hide().appendTo(o.div)
        ,editing = false
    o._edit_intent = false
    o.edit_mode = function(enabled){
        if(editing == enabled) return
        editing = enabled
        if(editing){
            text_editor.val(o.content()).show()
            o.content_element.detach()
            text_editor.focus()
        }
        else{
            env.History.saver(o.content, o.content_set, 'edit html').exec(
                text_editor.blur().hide().val())
            o.content_element.appendTo(o.div)
        }
    }
    o.focus.add(function(){
        o.edit_mode(o._edit_intent) })
    o.unfocus.add(function(){
        o.edit_mode(false) })

    var edit_src = memoize('edit_src', function(controls){
        var app = controls.single()
            ,btn = controls.addButton($('#controls_misc .edit_src'))
                .toggleClass('on', app._edit_intent)
        btn.on('click', function(){
            app._edit_intent = !app._edit_intent
            app.edit_mode(app._edit_intent)
            btn.toggleClass('on', app._edit_intent)
        })
    })
    edit_src.single = true
    o.make_controls.push(edit_src)

    Hive.App.has_opacity(o)
    // TODO: migrate this and use init_state.media
    o.make_controls.push(memoize("full_screen_control", function(o) {
        o.addButton($('#controls_image .set_bg'));
        o.div.find('.button.set_bg').click(function() {
            Hive.bg_change(o.single().state()) });
    }))
    o.make_controls[o.make_controls.length - 1].single = true;

    return o;
};
Hive.registerApp(Hive.App.Html, 'hive.html');

// Deprecated
// Hive.App.RawHtml = function(o) {
//     Hive.App.has_resize(o);
//     o.content = function() { return o.content_element[0].outerHTML; };
//     o.get_content = function() { o.content_element; }
//     o.set_content = function(new_content) { o.content_element.html(new_content); }
//     o.content_element = $(o.init_state.content).addClass('content');
//     o.div.append(o.content_element);

//     var controls = function(o){
//         o.addButtons($('#controls_raw_html'));
//         o.div.find('.edit').click(function(){
//             var dia = $($('#dia_edit_code')[0].outerHTML);
//             u.show_dialog(dia, {
//                 fade: false,
//                 close: function() {
//                     var new_content = dia.find('textarea').val();
//                     o.app.set_content(new_content);
//                 },
//                 open: function() {
//                     dia.find('textarea').val(o.app.get_content().html());
//                 }
//             });
//         });
//         //var inner = o.app.content_element.children();
//         //var width = inner.width();
//         //if (width < 100) width = 40;
//         //var height = inner.height();
//         //if (height < 100) height = 40;
//         //o.app.dims_set([width, height]);

//         return o;
//     };
//     o.make_controls.push(controls);

//     return o;
// };
// Hive.registerApp(Hive.App.RawHtml, 'hive.raw_html');

// TODO-refactor: We need to decide on an object model for developers
var editor = {};
var active_controls = [];
editor.add_slider = function(name, opts) {
    opts = $.extend(opts, {handle_name: name})
    var apps = env.Apps.filtered(function(a) { return a.client_visible; })
    for (var i = 0; i < apps.length; ++i) {
        var slider =
            Hive.App.has_slider_menu(apps[i], "", function(v) {
                return env.Selection.client_data_set(name, v)
            }, function() {
                return env.Selection.client_data(name)
            }, null, null, opts).controls
        if (i == 0) {
            editor.current_code.created_controls.push(slider);
            active_controls.push(slider);
        }
    }
}
editor.add_button = function(name, on_run, opts) {
    var apps = env.Apps.filtered(function(a) { return a.client_visible; })
    var handle_name = name
    var controls = function(o) {
        var handle = find_or_create_button(o, null, handle_name);
        handle.on("click", function(ev) {
            env.History.begin();
            on_run(ev);
            env.History.group(name);
        })
    }
    controls.display_order = 6
    // controls = memoize("userbutton_"+name, controls)
    for (var i = 0; i < apps.length; ++i) {
        apps[i].make_controls.push(controls)
        if (i == 0) {
            editor.current_code.created_controls.push(controls);
            active_controls.push(controls);
        }
    }
}

var g_module_attrs = ["name", "path", "path_view"]

Hive.App.Code = function(o){
    o.has_align = false
    o.client_visible = false
    Hive.App.has_resize(o)
    o.created_controls = []
    // ... or require a code to have been focused
    env.show_css_class = true

    //////////////////////////////////////////////////////////////////
    // Saveable
    // getter and setter for state which is visible to history
    o.history_state.add(function() {
        var state = { modules: o.module_imports }
        $.extend(o.history_state.return_val, state)
    }) 
    o.history_state_set.add(function(state) {
        if (state.modules)
            o.module_imports = state.modules
    })

    o.typename = function() {
        return ('js' == o.init_state.code_type) ? "code" : "style"
    }
    o.content = function(){ return o.editor.getValue() }
    o.run_module_func = function(module_func, callback, no_err, onerr) {
        editor.current_code = o;
        onerr = onerr || noop
        curl([o.module_name(no_err)], function(module){
            if (!module) {
                // console.log("Module load error")
                onerr()
            } else {
                if (typeof(module[module_func]) == "function")
                    module[module_func].apply()

                callback && callback(module);
            }
            editor.current_code = null;
        }, function(){
            onerr()
        })
    }

    o.is_module = function(){
        return o.init_state.code_type == 'js' && o.content()
    }

    // TODO: fix auto-loading by running first within try-catch, and if it 
    // has errors, defer it to run after editor load (setTimeout sufficient?)
    // otherwise the entire editor breaks when a code embed has syntax error.
    // DO NOT UNCOMMENT UNTIL FIXED
    // var _load = o.load
    // o.load = function() {
    //     if (_load) _load()
    //     if(o.is_module()) {
    //         setTimeout(function() {
    //             insert_code()
    //             o.run_module_func("editor")
    //         }, 1000)
    //     }
    // }

    var iter = -1, last_success = -1
    o.module_name = function(without_error, opts){
        var requested_iter = without_error ? last_success : iter
            , opts = $.extend({}, opts)
        if (opts.force) {// && requested_iter == -1) {
            // TODO: recursively ensure_dependencies in case they haven't run
            insert_code(opts.load)
            requested_iter = iter
        } else if (opts.load)
            opts.load()
        return "module_" + o.id + "_" + requested_iter
    }
    o.module_imports = []
    o.add_import = function(name, path) {
        o.module_imports.push({name:name, path:path})
    }
    var module_modules = function() {
        return [""].concat($.map(o.module_imports, 
            function(m) {
                var path = m.path
                var code_app = Hive.Apps.by_name(path)
                if (code_app && code_app.module_name)
                    path = code_app.module_name()
                return "'" + path + "'" 
            })).join(",")
    }
    var module_names = function() {
        return [""].concat($.map(o.module_imports, 
            function(m) { return m.name })).join(",")
    }

    var module_code = function() {
        // return o.content();
        if( o.init_state.url ) return '' // can't have src and script body
        return ( "define('" + o.module_name() + "', "
            + "['jquery'" + module_modules() + "], function($"
            + module_names() + ") {\n"
            + "var self = {}\n\n"
            + o.content() + "\n\n"
            + "return self\n})"
        )
    }
    var insert_code = function(onload, onerr){
        var code
        iter++

        if(o.init_state.code_type == 'js')
            code = module_code()
        else code = o.content()

        var el = o.code_element =
            o.init_state.code_type == 'css' ? $('<style>') : $('<script>')
        el.attr('type', o.mime).appendTo('#dynamic_group')

        // either a module with code content, or a script with url
        if(o.is_module()){
            el.removeAttr('src')

            // TODO-feature consider onload handler for CSS and maintaining
            // last_success
            el[0].onload = function(){
                o.run_module_func("", function(m) {
                    last_success = iter 
                }, false, onerr)
                // TODO-unhack: this should break for scripts that take longer than
                // 100ms to compile
                if (onload) setTimeout(onload, 100)
            }
        }
        else el.attr('src', o.init_state.url)

        // use a blob for source so syntax errors are properly reported,
        // instead of creating mysterious exception
        if(o.init_state.code_type == 'js')
            el.attr('src', u.string_to_url(code, o.mime))
        else el.html(code)
    }

    o.ensure_dependencies = function(onload) {
        var dependencies = 1
            , loaded = function() {
                if (! --dependencies && onload)
                    onload()
            }
        $.map(o.module_imports, function(m) {
            var path = m.path
            var code_app = Hive.Apps.by_name(path)
            if (code_app && code_app.module_name) {
                ++dependencies
                path = code_app.module_name(true, {force:1, load:loaded})
            }
        })
        loaded()
    }
    o.run = function() {
        if(!o.is_module()) return insert_code()
        o.ensure_dependencies(o.run_helper)
    }
    var animate_go
    o.run_helper = function(){
        // o.stop()
        var running_iter = last_success
        insert_code(function(){
            if(!o.is_module()) return
            o.run_module_func("run", function(module){
                if(running_iter != last_success) {
                    var new_success = last_success
                    last_success = running_iter
                    o.stop()
                    last_success = new_success
                }
                if(!module.animate) return
                var animate_frame = function(){
                    module.animate()
                    // TODO-compat: if requestAnimationFrame not supported,
                    // fallback to setTimeout
                    if(animate_go) requestAnimationFrame(animate_frame)
                }
                animate_go = 1
                animate_frame()
            })
        })
    }
    o.stop = function() {
        if(o.is_module()){
            if (last_success < 0) return
            o.run_module_func("stop", function() {
                animate_go = 0
            }, true)
        }
        o.code_element.remove()
    }
    o.edit = function() {
        if (o.created_controls.length == 0) {
            insert_code(function(){
                o.run_module_func("edit", function() { fixup_controls() }, true)
            })
        } else {
            var apps = env.Apps.filtered(function(a) { return a.client_visible; })
            // remove the associated edit controls from their apps
            while (o.created_controls.length) {
                var control = o.created_controls.pop();
                js_util.array_delete(active_controls, control);
                for (var i = 0; i < apps.length; ++i) {
                    var app = apps[i];
                    js_util.array_delete(app.make_controls, control);
                }
            }
            fixup_controls();
        }
    }

    function controls(o) {
        var sel = env.Selection, single = o.single()
        find_or_create_button(o, '.run').click(sel.run)
        find_or_create_button(o, '.stop').click(sel.stop)
        if (single && 'js' == o.single().init_state.code_type) {
            // set up modules menu
            var $drawer = $("#controls_misc .drawer.modules").clone()
                ,$table = $drawer.find("table")
            var add_row = function(data) {
                var $row = $drawer.find(".template").clone()
                $row.showshow().removeClass("template").appendTo($table)
                if (!data) 
                    return
                $.map(g_module_attrs, function(attr) {
                    if (data[attr]) {
                        $row.find("." + attr).val(data[attr])
                    }
                })
            }
            $drawer.find(".add").on("click", function() {
                add_row()
            })
            $drawer.delegate(".remove", "click", function() {
                var $row = $(this).parents("tr")
                $row.remove()
            })
            var $imports = find_or_create_button(o, '.imports').click(sel.edit)
            menu($imports, $drawer.appendTo(o.div.find(".buttons")), {
                // TODO: does this belong in history?
                open: function() {
                    $drawer.find("tr.data:not(.hide)").remove()
                    $.map(single.module_imports, function(data) {
                        add_row(data)
                    })
                }, close: function() {
                    single.module_imports = 
                    $.map($drawer.find("tr.data:not(.hide)"), function(row) {
                        var data = {}, $row = $(row)
                        $.map(g_module_attrs, function(attr) {
                            data[attr] = $row.find("." + attr).val()
                        })
                        return [data]
                    })
                }
            })
        }
        // o.hover_menu(o.div.find('.button.opts'), o.div.find('.drawer.opts'))
        // var showinview = o.div.find('.show_in_view')
        // showinview.prop('checked', o.app.init_state.show_in_view).on(
        //     'change', function(){
        //         o.app.init_state.show_in_view = showinview.prop('checked') })
    }
    controls.single_type = true
    o.make_controls.push(memoize('code_buttons', controls))
    Hive.App.has_shield(o)
    Hive.App.has_live_edit(o)

    var fixup_controls = function(controls) {
        controls = controls || env.Selection.controls;
        if (!controls) return
        // set the toggle state of the edit button
        if (o.created_controls.length > 0) {
            controls.div.find(".button.edit")
                .css({"background-color":"black", "color": "white"
                    ,"background-size":0})
        } else {
            controls.div.find(".button.edit")
                .css({"background-color":"transparent", "color": "black"
                    ,"background-size":""})
        }        
    }
    fixup_controls.display_order = 9
    o.make_controls.push(fixup_controls)

    o.focus.add(function(){
        o.editor.focus()
        o.div.removeClass('drag').css('opacity', .8)
    })
    o.unfocus.add(function(){
         o.div.addClass('drag').css('opacity', .2)
         o.editor.getInputField().blur()
    })

    var _remove = o.remove
    o.remove = function(){
        o.stop()
        _remove()
    }

    var keymap = {
        'Ctrl-/': function(cm){ cm.execCommand('toggleComment') }
    }

    var mimes = { js: 'application/javascript', css: 'text/css' }

    o.init_state.code_type == 'js' || o.init_state.code_type == 'css' || (
        o.init_state.code_type = 'js' )
    o.mime = mimes[o.init_state.code_type]
    o.code_element = $()

    // o.content_element = $('<textarea>').addClass('content code drag').appendTo(o.div);
    var mode = o.init_state.code_type
    if(mode == 'js') mode = 'javascript'
    o.editor = CodeMirror(o.div[0], { extraKeys: keymap ,mode: mode })
    o.editor.setValue(o.init_state.content || '')
    o.editor.on("change", function() {
        if (!o.liveedit())
            return

        o.run()
    })
    o.content_element = $(o.editor.getWrapperElement()).addClass('content code')
    // TODO-cleanup: Move to CSS
    o.div.css('background-color','white').css('opacity',.2);

    return o;
}
Hive.registerApp(Hive.App.Code, 'hive.code')

Hive.App.Image = function(o) {
    o.is_image = true;
    o.fixed_aspect = true;
    Hive.App.has_resize(o);
    Hive.App.has_crop(o);
    // Hive.App.has_color(o)

    // TODO-cleanup: aspects should be y/x
    o.get_aspect = function() {
        if (o.init_state.scale_x)
            return o.dims_relative()[0] / o.dims_relative()[1];
        return o.aspect;
    };
    o.content = function(content) {
        if(typeof(content) != 'undefined') o.url_set(content);
        return o.init_state.url;
    }

    /////////////////////////////////////////////////////////////////////////
    // Saveable
    o.history_state.add(function() {
        var s = {}
        if (o.init_state.scale_x) 
            s.scale_x = o.init_state.scale_x
        if (o.init_state.offset) 
            s.offset = o.init_state.offset.slice()
        $.extend(o.history_state.return_val, s)
    })
    o.history_state_set.add(function(s) {
        if (s.scale_x) o.init_state.scale_x = s.scale_x
        if (s.offset) o.init_state.offset = s.offset.slice()
    })
    o.state_update.add(function(s){
        // TODO-cleanup: migrate to use only url for consistency with other apps
        s.content = s.url = (s.url || s.content);
    })
    /////////////////////////////////////////////////////////////////////////

    o.url_set = function(src) {
        if(o.$img) o.$img.remove();
        o.$img = $("<img class='content'>").attr('src', src);
        // o.content_element = o.$img;
        o.content_element = o.content_element || $("<div>").appendTo(o.div);
        o.content_element.append(o.$img).addClass('crop_box');
        // o.div.append(o.$img);
        o.$img.load(function(){setTimeout(o.img_load, 1)});
        // We recreated the content_element, so reapply its handlers.
        Hive.App.has_image_drop(o);
    };
    o.img_load = function(){
        var imageSize = o.pixel_size();
        var imageWidth = imageSize[0], imageHeight = imageSize[1];
        o.aspect = imageWidth / imageHeight;
        if( ! o.init_state.dimensions ){
            var ww = $(window).width(), wh = $(window).height(), iw, ih, wa = ww / wh;
            if( (imageWidth > ww * .8) || (imageHeight > wh * .8) ){
                if( wa < imageWidth / imageHeight ){
                    iw = 800;
                    ih = iw / o.aspect;
                } else {
                    ih = 800 / wa;
                    iw = ih * o.aspect;
                }
            } else {
                iw = imageWidth / env.scale();
                ih = iw / o.aspect;
            }
            o.init_state.dimensions = [ iw, ih ];
        }
        o.$img.css('width', o.dims()[0] + 'px');
        // fit and crop as needed
        if (o.init_state.fit) {
            var opts = { dims:o.dims_relative(), pos:o.pos_relative(), fit:o.init_state.fit, 
                doit: (o.init_state.fit != 2), // Cropping needed, wait on execution
                scaled: [imageWidth, imageHeight] };
            var new_layout = o.fit_to(opts);
            if (opts.fit == 2) {
                o.init_state.scale_x = new_layout.dims[0] / opts.dims[0];
                o.init_state.offset = u._sub(new_layout.pos, opts.pos);
                o.init_state.offset = u._mul( 1 / opts.dims[0] /
                    o.init_state.scale_x)(o.init_state.offset);
            }
            o.init_state.fit = undefined;
        }
        o.allow_crop(true);
        o.load()
    };
    o.defer_load = true

    o.recenter = function() {
        var dims = o.dims_relative(), nat_height = dims[0] / o.aspect;
        o.init_state.offset[0] = 0
        o.init_state.offset[1] = 
            (dims[1] - nat_height) / 2 / dims[0] / o.init_state.scale_x;
        o.layout()
    }

    // TODO-cleanup: move to has_crop
    ;(function(){
        var cropping, $fake_img, $crop_bg, ref_offset, ref_dims, ref_scale_x
            ,drag_fake
        o.crop_ui_showhide = function(crop) {
            if (!crop) {
                if (! $fake_img)
                    return
                o.$img = o.$img.not($fake_img).not($crop_bg);
                $fake_img.remove()
                $crop_bg.remove()
                $fake_img = $crop_bg = undefined
                return
            }

            // show new img w/ opacity
            if ($fake_img)
                return
            $crop_bg = $('<div>').css('background-color', 'black')
                .appendTo(o.div)
            $fake_img = o.$img.clone().appendTo(o.div).css({ 'opacity': .5
                , 'z-index': 0 }).addClass("fake")
            o.$img = o.$img.add($fake_img).add($crop_bg);
            o.layout()
        }
        // UI for setting .offset of apps on drag after long_hold
        o.long_hold = o.begin_crop = function(ev){
            if(o != ev.data) return;
            if(o.resizing() || cropping) return; // don't begin crop in the middle of a resize
            if(o.has_full_bleed() && ($(ev.target).hasClass("resize")
                || $(ev.target).hasClass("resize_v")) ) return;
            if(!o.init_state.scale_x) 
                if (!o.allow_crop()) return false;
            // TODO: should we only hide controls if selected?
            $("#controls").showhide(false);
            // env.Selection.hide_controls();

            ev.stopPropagation();
            cropping = true;
            o.crop_ui_showhide(true);
            return false;
        };
        o.long_hold_cancel = function(ev){
            if(!cropping) return;
            cropping = false;

            $("#controls").showhide(true);
            // env.Selection.show_controls();
            if (!o.cropping_active)
                o.crop_ui_showhide(false);
            if (ev)
                ev.stopPropagation();
        };

        o.dragstart = function(ev){
            if (!cropping) {
                if (!o.cropping_active)
                    return;
                o.begin_crop(ev)
            }
            ev.stopPropagation();
            ref_offset = o.offset();
            ref_pos = u._add(o.pos(), ref_offset);
            drag_fake = $(ev.target).hasClass("fake")
            // This code "fixes" one of the coordinates so it won't be modifyable
            // o.fixed_coord = (ref_offset[0] == 0) ? 0 : ((ref_offset[1] == 0) ? 1 : -1);
            // history_point = env.History.saver(o.offset, o.offset_set, 'move crop');
            env.History.change_start()
        };
        o.drag = function (ev, dd, shallow) {
            if(!cropping || !ref_offset) return;
            ev.stopPropagation();
            var delta = [dd.deltaX, dd.deltaY];
            if (!drag_fake)
                delta = u._mul(-1, delta)
            if(ev.shiftKey)
                delta[ Math.abs(dd.deltaX) > Math.abs(dd.deltaY) & 1 ] = 0;
            // constrain delta for now to the "free" dimension
            if (o.fixed_coord >= 0)
                delta[o.fixed_coord] = 0;
            delta = u._add(delta)(ref_offset);
            var dims = o.dims();
            // constrain the crop to within the bounds of app
            var tuple = [];
            tuple[0] = [dims[0]*(1 - o.init_state.scale_x), 0, 0];
            tuple[1] = [dims[1] - dims[0] / o.aspect * o.init_state.scale_x, 0, 0];
            for (var j = 0; j < 2; ++j) {
                if (tuple[j][0] > tuple[j][2]) { // ensure the tuple is sorted
                    var tmp = tuple[j][0];
                    tuple[j][0] = tuple[j][2];
                    tuple[j][2] = tmp;
                }
                tuple[j][1] = undefined
                // If we want to have center snapping:
                tuple[j][1] = .5 * (tuple[j][0] + tuple[j][2]);
                delta[j] = u.interval_constrain(delta[j], tuple[j]);
            }
            // snap to edge/center
            if (context.flags.snap_crop) {
                var my_tuple = [ [ delta[0] ], [ delta[1] ] ];
                delta = u.snap_helper(my_tuple, { tuple: [ [tuple[0]], [tuple[1]] ] });
            }
            o.offset_set(delta);
            if (!drag_fake)
                o.pos_set(u._add(ref_pos, u._mul(-1,delta)))
            o.layout();
        };
        o.dragend = function(ev){
            if(!cropping) return;
            env.History.change_end("Adjust crop")
            // history_point.save();
            o.long_hold_cancel(ev);
        };

        var _resize = o.resize, _resize_end = o.resize_end, 
            _resize_start = o.resize_start;
        o.resize_start = function() {
            if (!cropping) 
                return _resize_start();
            ref_dims = o.dims_relative();
            ref_scale_x = o.init_state.scale_x;
            history_point = env.History.saver(
                o.state, o.state_update, 'move crop');
        };
        o.resize = function(delta, coords) {
            if(!cropping)
                return _resize(delta, coords)
            env.Apps.begin_layout()
            var aabb = o.resize_helper(delta, coords, false, false)
            aabb = u.constrain_aabb(aabb, 
                u.pos_dims2aabb(o.image_pos_dims()), [1, 1])
            var pos = aabb[0], dims = u._sub(aabb[1], aabb[0])
                ,pos_dims = u.aabb2pos_dims(aabb)
                ,dims = pos_dims[1]
            o.div_aspect = dims[0] / dims[1]
            o.crop_pos_dims_set(pos_dims)
            var scaled = dims[0] / ref_dims[0];
            o.init_state.scale_x = ref_scale_x / scaled;
            o.pos_relative_set(pos_dims[0])
            o.dims_relative_set(pos_dims[1])
            env.Apps.end_layout()
            return
        };
        o.resize_end = function(skip_history) {
            if(!cropping) 
                return _resize_end(skip_history);
            history_point.save();
            o.long_hold_cancel();
            ref_dims = undefined;
        };

        // Editor bounds of uncropped image
        o.image_pos_dims = function() {
            var dims_x = o.dims_relative()[0], scale = []
            scale[0] = o.init_state.scale_x || 1,
            scale[1] = scale[0] / o.aspect;
            var offset = u._mul(scale[0] * dims_x, o.init_state.offset)
            var dims = u._mul(scale, dims_x)
            var pos = u._add(offset, o.pos_relative())
            return [pos, dims]
        }
        o.crop_pos_dims_set = function(pos_dims) {
            var pos = pos_dims[0], dims = pos_dims[1], _bounds = o.image_pos_dims()
            // o.init_state.scale_x = _bounds[1][0] / dims[0]
            o.init_state.offset = u._div(u._sub(_bounds[0], pos), 
                o.dims_relative()[0] * o.init_state.scale_x)
        }
        // screen coordinates
        o.offset = function() {
            if (!o.init_state.scale_x)
                return undefined;
            return u._mul(o.init_state.scale_x * o.dims()[0])(o.init_state.offset);
        }
        o.offset_set = function(offset) {
            if (!offset) o.init_state.offset = undefined;
            else
                o.init_state.offset = u._mul(1 / o.init_state.scale_x / o.dims()[0])(offset);
            o.layout();
        };

        // TODO-cleanup: move to has_crop
        o.allow_crop = function(force) {
            if (!force && !context.flags.rect_drag_drop)
                return false;

            o.init_state.scale_x = o.init_state.scale_x || 1;
            o.init_state.offset = o.init_state.offset || [0, 0];
            // o.is_cropped = true;
            // var happ = o.content_element.parent();
            // o.content_element = $('<div class="crop_box">');
            // o.$img.appendTo(o.content_element);
            // o.content_element.appendTo(happ);
            o.div_aspect = o.dims()[0] / o.dims()[1];
            o.layout();
            return true;
        };

        // o.make_controls.push(function(sel){
        //     evs.long_hold(sel.div.find('.resize'), sel.single());
        // })
        // o.make_controls[o.make_controls.length - 1].single = true;
    })();

    var _layout = o.layout;
    o.max_height = function(){
        off = o.offset() || [0,0];
        off = off[1] / env.scale();
        return o.dims_relative()[0] / o.aspect + off;
    }
    o.layout = function() {
        if (_layout()) return true;
        var dims = o.dims(), scale_x = o.init_state.scale_x || 1,
            scale_y = scale_x / o.aspect;
        o.$img.css({ 'width': scale_x * dims[0], 'height': scale_y * dims[0] })
        var offset = o.offset();
        if (offset) {
            o.$img.css({"margin-left": offset[0], "margin-top": offset[1]});
            var border_width = o.border_width()
            o.div.find(".crop_box img").css(
                {"margin-left": offset[0] - border_width
                ,"margin-top": offset[1] - border_width})
        }
    };

    o.pixel_size = function(){
        return [o.$img.prop('naturalWidth'), o.$img.prop('naturalHeight')];
    };

    function controls(o) {
        o.addButtons($('#controls_image'));
        o.div.find('.button.set_bg').click(function() {
            Hive.bg_change(o.single().state()) });
    };
    controls.single = true;
    Hive.App.has_link_picker(o);
    o.make_controls.push(controls);

    Hive.App.has_rotate(o);
    Hive.App.has_opacity(o);
    Hive.App.has_border_radius(o);

    o.$img = $();
    Hive.App.has_border_width(o);
    Hive.App.has_color(o, "stroke");
    o.state_update(o.init_state);
    o.url_set(o.init_state.url);
    Hive.App.has_image_drop(o);

    return o;
}
Hive.registerApp(Hive.App.Image, 'hive.image');

Hive.App.Rectangle_Parent = function(o) {
    Hive.App.has_resize(o);
    o.init_state.css_state = $.extend(o.init_state.content, o.init_state.css_state);

    Hive.App.has_rotate(o);
    Hive.App.has_color(o);
    o.make_controls[o.make_controls.length - 1].display_order = 2
    Hive.App.has_opacity(o);
    Hive.App.has_border_width(o);
    Hive.App.has_color(o, "stroke");
    Hive.App.has_link_picker(o);

    o.content_element = $("<div class='content drag'>").appendTo(o.div)

    // Hive.App.has_image_drop(o);
    return o;
};

Hive.App.Rectangle = function(o) {
    Hive.App.Rectangle_Parent(o);
    Hive.App.has_border_radius(o);
    Hive.App.has_image_drop(o);
    return o;
};
Hive.registerApp(Hive.App.Rectangle, 'hive.rectangle');

Hive.App.Circle = function(o) {
    Hive.App.Rectangle_Parent(o);
    Hive.App.has_image_drop(o);
    o.set_css({'border-radius':'50%'});
    return o;
};
Hive.registerApp(Hive.App.Circle, 'hive.circle');

Hive.App.has_ctrl_points = function(o){
    // TODO-feature-polish-control-points: make control points actual objects
    // that can be focused and handle events, like nudge, delete, etc

    var app = o;
    o.make_controls.push(function(o){
        var p_els = []

        var _layout = o.layout
        o.layout = function(){
            if (_layout()) return true;

            js.range(app.points_len()).map(function(i){
                var p = u._mul(app.point(i))(env.scale())
                p_els[i].css({left: p[0], top: p[1] })
            })
        }

        js.range(app.points_len()).map(function(i){
            p_els[i] = $('<div>')
                .addClass('control point')
                .appendTo(o.fixed_div)
                .on('dragstart', function(ev){
                    env.History.change_start();
                    app.transform_start(i)
                    env.Selection.hide_controls()
                    ev.stopPropagation()
                })
                .on('drag', function(ev, dd){
                    delta = u._div([dd.deltaX, dd.deltaY])(env.scale())
                    app.point_move(i, delta)
                })
                .on('dragend', function(ev){
                    env.Selection.show_controls()
                    ev.stopPropagation()
                    env.History.change_end("Adjust shape");
                })
        })
    })
    o.make_controls[o.make_controls.length - 1].single = true;
}

Hive.App.Polygon = function(o){
    Hive.App.has_resize(o);
    Hive.App.has_ctrl_points(o)
    var common = $.extend({}, o), poly_el, blur_el

    var style = {}, state = o.init_state
    style['stroke-width'] = 0
    style['stroke'] = '#000'
    style['stroke-linejoin'] = 'round'
    style['fill'] = '#000'
    js.setdefault(state, {points: [], style: {}})
    js.setdefault(state.style, style)
    var points = state.points

    o.get_aspect = function() { 
        var dims = o.dims_relative(); 
        return dims[0]/dims[1]
    }
    o.points = function(){ return points.slice() }
    o.points_len = function(){ return points.length }
    o.point_insert = function(index){
        var svg_point = o.content_element[0].createSVGPoint()
            ,p = points[index-1]
        svg_point.x = p[0]
        svg_point.y = p[1]
        poly_el[0].points.insertItemBefore(svg_point, index)
        points.splice(index, 0, p)
        o.reframe(true)
    }
    o.point_remove = function(index){
        poly_el[0].points.removeItem(index)
        points.splice(index, 1)
        ref_points.splice(index, 1)
        o.reframe(true)
    }
    o.pts = function(){
        var pos = o.pos_relative()
        return points.map(u._add(pos))
    }

    // o.center = function(){
    //     return u._div(points.reduce(function(a, b){ return u._add(a)(b) })
    //         )(points.length)
    // }
    o.size_update = function(new_dims){
        o.content_element[0].setAttribute('viewBox',
            [0, 0, new_dims[0], new_dims[1]].join(' '))
    }

    o.point_offset = function(){
        var off = state.style['stroke-width'] / 2 + o.blur() * 2
        return [off, off]
    }
    var _min_pos = o.min_pos, _max_pos = o.max_pos
    o.min_pos = function() {
        return u._sub(_min_pos(), o.point_offset())
    }
    o.max_pos = function() {
        return u._add(_max_pos(), o.point_offset())
    }
    o.repoint = function(){
        var  old_points = points
            ,f = u.points_rect(old_points)

        var  pad = o.point_offset()
            ,min_pos = u.nth(f, 0)
            ,points_delta = u._sub(pad)(min_pos)
            ,old_bounds = u._apply(Math.max, 0.000001, u._sub(u.nth(f,1), min_pos))
            ,new_dims = u._sub(o.dims_relative(), u._mul(pad, 2))
            ,fudge_coords = [0, 0]
        // For polygons (at least 3 points), prevents degeneracy by bumping
        // dimensions by a small amount
        if (points.length > 2) {
            new_dims.map(function(c, i) {
                if (Math.abs(c) < 0.0001)
                    fudge_coords[i] = 0.0002
            })
        } else {
            // for lines, force degeneracy
            new_dims.map(function(v, i) {
                if (v < 0)
                    fudge_coords[i] = -v
            })
        }

        new_dims = u._add(new_dims, fudge_coords)
        new_dims = new_dims.map(Math.abs)

        var dims_ratio = u._div(new_dims, old_bounds)
            ,new_off = u._sub( pad, u._mul(min_pos, dims_ratio) )

        old_points.map(function(p, i){
            o.point_update(i, u._add(u._mul(p, dims_ratio), new_off))
        })
        if (!u.array_equals(fudge_coords, [0, 0])) {
            _dims_relative_set(u._add(o.dims_relative(), fudge_coords))
            //u.set_debug_info({new_dims:new_dims, curr_dims:o.dims_relative(),f:f})
            return
        }
    }

    // display-only: don't change coords, for use during transformations
    o.reframe = function(display_only){
        var  old_points = (display_only ? points : ref_points)
            ,f = u.points_rect(old_points)

        var  pad = o.point_offset()
            ,min_pos = u.nth(f, 0)
            ,points_delta = u._sub(pad, min_pos)
            ,new_dims = u._add(u._sub(u.nth(f,1), min_pos), u._mul(pad)(2) )
            ,new_pos = u._sub(ref_pos, points_delta )

        old_points.map(function(p, i){
            o.point_update(i, u._add(p)(points_delta), display_only)
        })
        o.size_update(new_dims)

        if(display_only){
            var s = env.scale()
            u.css_coords(o.div, u._mul(new_pos)(s), u._mul(new_dims)(s))
            // if(o.controls) o.controls.layout();
        }
        else{
            o.pos_relative_set(new_pos)
            o.dims_relative_set(new_dims)
        }
        // ref_dims = undefined
    }
    var ref_point = [0,0] ,ref_points ,ref_pos ,ref_dims
        ,ref_center ,ref_stroke_width, ref_angle
    o.transform_start = function(i){
        ref_angle = 0
        ref_point = points[i].slice()
        ref_points = o.points()
        ref_pos = o.pos_relative()
        ref_dims = o.dims_relative()
        // TODO: Use real centroid
        // http://stackoverflow.com/questions/16282330/find-centerpoint-of-polygon-in-javascript
        ref_center = u._sub(o.centroid_relative())(ref_pos)
        ref_stroke_width = o.border_width()
    }
    o.point_update = function(i, p, display_only){
        if(!display_only) points[i] = p.slice()
        // set all the points?
        // for (var j = 0; j < points.length; ++j) {
        //     var svg_p = poly_el[0].points.getItem(j)
        //     svg_p.x = ((i==j) ? p : points[j])[0]
        //     svg_p.y = ((i==j) ? p : points[j])[1]
        // }
        var svg_p = poly_el[0].points.getItem(i)
        svg_p.x = p[0]
        svg_p.y = p[1]
    }
    o.point_move = function(i, p){
        ref_points[i] = u._add(ref_point)(p)
        o.reframe()
    }
    o.point_set = function(i, p){
        ref_points[i] = points[i] = p
        o.reframe(true)
    }
    o.point = function(i){ return points[i].slice() }
    o.points_set = function(ps){
        $.each(ps, o.point_update)
        o.transform_start(0)
        o.reframe()
        if(o.controls) o.controls.layout()
    }

    /////////////////////////////////////////////////////////////////////////
    // Saveable
    o.history_state.add(function() {
        s = { points: o.points() }
        $.extend(o.history_state.return_val, s)
    })
    o.history_state_set.add(function(s) {
        if(s.points) o.points_set(s.points)
    })
    /////////////////////////////////////////////////////////////////////////

    var _dims_relative_set = o.dims_relative_set
    o.dims_relative_set = function(dims) {
        dims = u._apply(Math.max, 1, dims)
        if (points.length == 2) {
            // Keep degenerate lines degenerate
            var f = u.points_rect(points)
                ,pad = o.point_offset()
            dims.map(function(v, i) {
                if (u.dist(f[i]) < 0.01)
                    dims[i] = 2*pad[i]
            })
        }
        _dims_relative_set(dims)
        o.size_update(dims)
        o.repoint()
    }

    // TODO-cleanup: these functions belong in App
    o.set_css = function(props, no_reframe) {
        $.extend(state.style, props);
        // var restroke = (typeof props['stroke-width'] != 'undefined')
        // if(restroke){
        //     var v = parseInt(props['stroke-width'])
        //     if(!v) v = 0
        //     // limit stroke width to dimensions
        //     // var max_width = u._apply(function(a,b) {
        //     //         return Math.ceil(a*b)
        //     //     }, .5, o.dims_relative())
        //     // props['stroke-width'] = Math.min(v, max_width[0], max_width[1])
        // }
        delete props.position
        poly_el.css(props)
    }
    o.css_setter = function(css_prop){ return function(v) {
        var ps = {}; ps[css_prop] = v; o.set_css(ps); } }
    o.css_getter = function(css_prop){ return function(){
        return state.style[css_prop] } }

    o.color = o.css_getter('fill')
    o.color_set = o.css_setter('fill')
    o.stroke = o.css_getter('stroke')
    o.stroke_set = o.css_setter('stroke')

    o.blur = function(){ return state.blur || 0 }
    o.blur_set = function(v){
        state.blur = v
        if(v){
            blur_el[0].setAttribute('stdDeviation', v)
            poly_el.css('filter', 'url(#' + o.id + '_blur)')
        }
        else
            poly_el.css('filter', '')
        o.transform_start(0)
        o.reframe(true)
    }

    o.rotate_start = function(){
        o.transform_start(0)
    }
    o.centroid_relative_set = function(centroid) {
        // ref_center = u._sub(o.centroid_relative())(ref_pos)
        o.pos_relative_set(u._add(o.pos_relative(), 
            u._sub(centroid, o.centroid_relative())))
    }
    Hive.App.has_rotate(o)
    o.angle = function() { return 0; }
    o.angle_set = function(angle){
        var a = angle - ref_angle
        ref_points.map(function(p, i){
            o.point_update(i, u.rotate_about(p, ref_center, u.deg2rad(a)))
        })
        if (env.Selection.count() > 1) {
            o.transform_start(0)
            o.reframe()
            ref_angle = angle
        } else
            o.reframe(true)
    }
    o.rotate_end = function(){
        o.transform_start(0)
        o.reframe()
    }
    var history_point
    o.border_width = o.css_getter('stroke-width')
    o.border_width_set = function(v) {
        v = Math.max(v, o.init_state.is_line ? .5 : 0)
        o.css_setter('stroke-width')(v)
        o.transform_start(0)
        o.repoint()
        if (env.Selection.controls)
            o.fixup_border_controls(env.Selection.controls);
    }
    Hive.App.has_color(o);
    Hive.App.has_border_width(o) //, {slider_opts:{max:100}})
    Hive.App.has_color(o, "stroke");
    o.make_controls.slice(-1)[0].no_line = true
    Hive.App.has_blur(o)
    Hive.App.has_opacity(o)
    o.line_set = function() {
        o.init_state.is_line = true
        // remove stroke color and make color actually change stroke color
        o.color = o.stroke
        o.color_set = o.stroke_set
        o.make_controls = o.make_controls.filter(function(c) {
            return !c.no_line
        })
    }
    Hive.App.has_link_picker(o);

    if(!points.length)
        points.push.apply(points, [ [0, 0], [50, 100], [100, 0] ])
    o.div.addClass('svg')
    o.content_element = $("<svg xmlns='http://www.w3.org/2000/svg'"
        + " class='drag content' viewbox='0 0 100 100'"
        + " preserveAspectRatio='none'>"
        + "<filter id='" + o.id + "_blur' filterUnits='userSpaceOnUse'>"
            + "<feGaussianBlur/></filter>"
        + "<polygon points='0,0'></polygon></svg>")
        .appendTo(o.div)
    poly_el = o.content_element.find('polygon')
    poly_el.attr('points', points.map(function(p){ return p[0]+','+p[1] })
        .join(' '))
    blur_el = o.content_element.find('feGaussianBlur')

    if (points.length && !o.init_state.dimensions) {
        var f = u.points_rect(points)
        o.init_state.dimensions = u._sub(u.nth(f,1), u.nth(f,0))
    }
    o.dims_relative_set(o.init_state.dimensions || [100, 100])
    o.set_css(state.style)
    o.blur_set(o.blur())
    o.transform_start(0)
    o.reframe()
    if (o.init_state.is_line)
        o.line_set()

    return o;
};
Hive.registerApp(Hive.App.Polygon, 'hive.polygon');

// Polygon creation tool
(function(o){
    var creating, template, point_i, handle_template = {}, handle_freeform = {}
        // , orig_dims
    o.handler_type = 1

    o.mode = function(_template){
        // set creation mode, by adding appropriate event handler properties to
        // Hive.App.Polygon, which is given focus.
        // If _template is false, make free form (points picked by clicks)
        // Otherwise create a shape defined by a template Polygon object,
        if(_template){
            template = $.extend(true, {}, _template)
            for(k in handle_freeform) delete o[k]
            $.extend(o, handle_template)
        }
        else{
            for (var k in handle_template) delete o[k]
            $.extend(o, handle_freeform)
        }
    }

    o.finish = function(ev){
        if (!u.is_ctrl(ev)) {
            // Default is adding single shape. Ctrl+click to add several
            o.unfocus()
            // Focus last template
            env.Selection.update([template])
        }
        if (!creating)
            return false
        if(creating.points_len() < 2){
            creating._remove()
            return false
        }
        creating.reframe && creating.reframe()
        creating = false
        point_i = false
    }

    o.focus = function(){
        // TODO: UI for indicating polygon drawing is active
        // probably highlight shape menu at bottom middle
        evs.handler_set(o);
        u.cursor_set('draw')
    };
    o.unfocus = function(){
        evs.handler_del(o);
        u.cursor_set('default')
    };

    var pos = function(ev){
        var win = window
        return u._mul(1 / env.scale())([ev.clientX + window.scrollX, 
            ev.clientY + window.scrollY]) }

    var from_template = function(){
        var s = (template.state && template.state()) || template
        delete s.position
        delete s.id
        delete s.z
        return s
    }

    var no_click
    handle_template.mouseup = function(ev){
        // TODO-cleanup-events: use better implementation,
        // where it's easier to override app drag events

        // mouseup must bubble to drag_base in order for dragstart to work
        // but must not custom bubble in events module to selection
        ev.stop_editor_propagation()
        if(ev.data) return // if mouseup fired from app, ignore
        if(no_click){
            no_click = false
            return
        }
        var s = from_template()
        var dims = s.dimensions
        template = Hive.new_app(s, {no_select: 1, position: [0,0]
            , load: function(a) {
                a.center_relative_set(pos(ev))
                // This fixes issue of creating polygon moving to 100,100
                // because the load sequence applies a rotation and ref_center
                // would be undefined
                // TODO: should any op which dirties position call transform_start?
                // namely, should app or polygon call transform_start from layout?
                a.transform_start && a.transform_start(0)
            }})
        template.center_relative_set(pos(ev))
        o.finish(ev)
    }

    var orig_pos, orig_dims, orig_aspect;
    handle_template.dragstart = function(ev, dd){
        // absolutely no idea why this is being called twice
        ev.stopPropagation()
        if(creating) return
        var s = from_template()
        s.position = pos(ev)
        orig_pos = u._mul(env.scale(), s.position)
        creating = template = Hive.new_app(s, {no_select: 1})
        orig_dims = template.dims();
        orig_aspect = orig_dims[0] / orig_dims[1]
        if (creating.points_len && creating.points_len() == 2) {
            // To make moving the point around relatively equivalent to
            // absolute, just set it to 0,0.
            creating.point_set(0, [0,0])
            creating.point_set(1, [0,0])
            creating.transform_start(1)
            // creating.border_width_set(2)
        }
    }
    handle_template.drag = function(ev, dd){
        no_click = true
        // TODO-merge-conflict?
        if(!creating) return
        var new_dims = [dd.deltaX, dd.deltaY]
            , new_aspect = new_dims[0] / new_dims[1]
        if (creating.points_len && creating.points_len() == 2) {
            // console.log(creating.points())
            if (ev.shiftKey) {
                if (Math.abs(new_dims[0]) > Math.abs(new_dims[1]))
                    new_dims[1] = 0
                else
                    new_dims[0] = 0
            }
            creating.point_move(1, u._div(new_dims, env.scale()))
            return
        }
        // maintain original aspect ratio
        if (ev.shiftKey) {
            var sgn = u._sign(new_aspect)
            new_dims = (orig_aspect > Math.abs(new_aspect)) ?
                [new_dims[0], new_dims[0]/orig_aspect*sgn] :
                [new_dims[1]*orig_aspect*sgn, new_dims[1]]
        } else {
            // save new proportion
            // orig_aspect = new_aspect
        }
        var bounds = orig_pos.map(function(p,i) { return [p, p + new_dims[i]] })
        bounds.map(function(v) { v.sort(js.op['-']) })
        new_dims = bounds.map(function(v) {
            return Math.max(1, v[1] - v[0])
        })
        creating.pos_set(u.nth(bounds, 0))
        creating.dims_set(new_dims)
    }
    handle_template.dragend = function(ev, dd){
        if (creating.points_len && creating.points_len() == 2) {
            creating.reframe()
            creating.line_set()
        }
        creating = false
        o.finish(ev)
        ev.stopPropagation()
    }

    handle_freeform.click = handle_freeform.mousedown = handle_freeform.drag
        = handle_freeform.dragstart = function(e){ return false };

    var ref_pos
    handle_freeform.mouseup = function(ev){
        var p = pos(ev)

        if(!creating){
            creating = template = Hive.new_app( {'type': 'hive.polygon'
                ,points: [[0,0], [0,0]], position: p, dimensions: [1,1] }
                ,{ no_select: 1, defer_load: true } )
            point_i = 1
            creating.load()
            creating.transform_start(0)
            ref_pos = creating.pos_relative()
            return false
        }

        ref_pos = creating.pos_relative()
        var cur_p = creating.point(point_i)
            ,close_d = u._apply(u.dist, creating.point(0), cur_p)

        if(u.array_equals( cur_p, creating.point(point_i-1) )
            || close_d[0] + close_d[1] < 5
        ){
            // double click ends creating
            creating.point_remove(point_i)
            o.finish(ev)
            creating = false
            // HACKHACK: Somehow this is creating a drag event.  Suppress it.
            // $.data( document, "suppress.mousemove" , new Date().getTime() + 1000)
            return true//false
        }

        // add point
        point_i = creating.points_len()
        creating.point_insert(point_i)
        creating.transform_start(point_i)

        return false
    };

    handle_freeform.mousemove = function(ev){
        if(creating){
            var p = u._sub(pos(ev))(ref_pos)
            creating.point_set(point_i, p)
        }
    }

    o.keydown = function(ev){ 
        if(creating){
            if(ev.keyCode == 27){ // esc
                creating._remove()
                return creating = false
            }
            else if(ev.keyCode == 13){ // enter
                o.finish(ev)
                return false
            }
        }
    }

    o.mode(false)
})(Hive.App.Polygon);


Hive.App.Sketch = function(o) {
    Hive.App.has_resize(o);
    var common = $.extend({}, o);

    var state = {};
    o.content = function() { return {
         'src' : o.win.get_image()
        ,'fill_color' : o.win.COLOR
        ,'brush' : o.win.get_brush()
        ,'brush_size' : o.win.BRUSH_SIZE
    }; };
    o.set_content = function(c) {
        if(c.src) o.win.set_image(c.src);
        if(c.brush) o.set_brush(c.brush);
        if(c.fill_color) o.win.COLOR = c.fill_color;
        if(c.brush_size) o.win.BRUSH_SIZE = c.brush_size;
    };

    o.fixed_aspect = true;

    o.focus.add(function() { o.win.focus() });

    o.set_brush = function( val ){
        o.brush_name = val;
        o.win.set_brush(val);
    };

    function controls(o) {
        if (!o.single()) return;
        var app = o.app.sel_app();
       
        o.addButtons($('#controls_sketch'));
        u.append_color_picker(o.div.find('.drawer.fill'), app.fill_color, '#000000');

        o.hover_menu(o.div.find('.button.fill'), o.div.find('.drawer.fill'),
            { auto_close : false });
        //TODO: What does this click on the brush handle do?
        var brush_btn = o.div.find('.button.brush')
            .click( function(){
                 app.set_brush( app.brush_name );
            });
        var brush_menu = o.hover_menu(brush_btn, o.div.find('.drawer.brush'));
        o.div.find('.button.eraser').click( function(){ app.win.set_brush( 'eraser' ) });
        o.div.find('.drawer.brush .option').each(function(i, e) { $(e).click(function() {
            app.set_brush($(e).attr('val'));

            o.div.find('.drawer.brush .option').removeClass("selected");
            $(e).addClass("selected");
            brush_menu.close();
        }); })
        o.div.find('.drawer.brush .option[val=' + app.brush_name + ']').click();

        return o;
    };
    o.make_controls.push(controls);
    var app = o.sel_app();
    Hive.App.has_slider_menu(o, '.size'
        ,function(v) { env.Selection.sel_app().win.BRUSH_SIZE = v; }
        ,function() { return env.Selection.sel_app().win.BRUSH_SIZE; }
        ,undefined,undefined,{single: true});
    Hive.App.has_rotate(o);
    Hive.App.has_opacity(o);
    Hive.App.has_shield(o);

    o.content_element = $('<iframe>').attr('src', '/lib/harmony_sketch.html')
        .css({'width':'100%','height':'100%','position':'absolute'});
    o.iframe = o.content_element.get(0);
    o.fill_color = function(hex, rgb) { o.win.COLOR = rgb; }
    o.div.append(o.content_element);
    o.content_element.load(function() {
        o.win = o.content_element.get(0).contentWindow;
        if(o.init_state.content) o.set_content(o.init_state.content);
        o.load();
    });
    o.defer_load = true

    o.update_shield();

    return o;
};
Hive.registerApp(Hive.App.Sketch, 'hive.sketch');

Hive.App.Audio = function(o) {
    Hive.App.has_resize(o)
    Hive.has_scale(o);
    if (context.flags.autoplay) {
        Hive.App.has_autoplay(o)
        Hive.App.has_autohide(o)
    }
    
    o.content = function() {
        return o.content_element[0].outerHTML;
    };

    // enforce 25px < height < 400px and minimum aspect ratio of 2.5:1
    var _dims_relative_set = o.dims_relative_set;
    o.dims_relative_set = function(dims) {
        var sf = env.scale();
        if (dims[1] / sf < 25) dims[1] = 25 * sf;
        if (dims[1] / sf > 400) dims[1] = 400 * sf;
        if (dims[0] < 2.5 * dims[1]) dims[0] = 2.5 * dims[1];

        o.scale_set(dims[1] / 35);
        _dims_relative_set(dims);
    }

    o.color = function(){
        return o.init_state.color; };
    o.color_set = function(v){
        o.init_state.color = v;
        o.div.find('.jp-play-bar, .jp-interface').css('background-color', v);
    };

    var _layout = o.layout;
    o.layout = function() {
        if (_layout()) return true;
        o.div.css('font-size', (env.scale() * o.scale()) + 'em');
        var height = o.div.find('.jp-interface').height();
        o.div.find('.jp-button').width(height).height(height);
    }

    o.load.add(function(){
        o.dims_set(o.dims());
        o.scale_set(o.dims()[1] / 35);
        o.color_set(o.color());
    });

    o.set_shield = function() { return true; }

    /////////////////////////////////////////////////////////////////////////
    // Saveable
    o.state_update.add(function(s){
        if(typeof s.file_meta == 'object')
            o.content_element.attr('title', [s.file_meta.artist, s.file_meta.album,
                s.file_meta.title].join(' - '));
        if(typeof s.url != 'undefined'){
            var new_content = o.skin();
            o.content_element.replaceWith(new_content);
            o.content_element = new_content;
            o.color_set(o.color());
            // ideally jPlayer API would be used so the interface
            // isn't reset, but this doesn't work, tested 2013-10
            //o.content_element.jPlayer('setMedia', s.url);
        }
    })
    /////////////////////////////////////////////////////////////////////////

    o.skin = function(){
        return $( $.jPlayer.skin.minimal(
            o.init_state.url, u.random_str() )
        )
            .addClass('content')
            .css('position', 'relative')
            .css('height', '100%')
            .appendTo(o.div);
    };

    // Mixins
    Hive.App.has_shield(o, {always: true});
    Hive.App.has_opacity(o);
    Hive.App.has_color(o);

    // Initialization
    if(! o.init_state.dimensions) o.init_state.dimensions = [ 200, 35 ];
    o.content_element = o.skin();

    if(!o.init_state.color) o.init_state.color = colors[23];
    if (menu.last_item && menu.last_item.hasClass("autoplay")) {
        menu.last_item = undefined
        o.autoplay_set(true)
        o.autohide_set(true)
    }

    o.update_shield();
    return o;
};
Hive.registerApp(Hive.App.Audio, 'hive.audio');


// TODO-refactor: move into app_modifiers
Hive.App.has_link_picker = function(app) {
    app.link_set = function(v){ 
        app.init_state.anchor = v;
    }
    app.link = function() {
        return app.init_state.anchor;
    }
    if( !env.Selection.link_set ){
        ['link', 'link_set'].map(function(el,i) {
            env.Selection.set_standard_delegate(el)
        })
    }
    var controls = function(controls) {
        // var app = controls.single()
        find_or_create_button(controls, ".link")
        controls.append_link_picker(controls.div.find('.buttons'));
    }
    controls.single = true
    controls.display_order = 3
    app.make_controls.push(memoize("link_picker", controls))
}

Hive.App.has_nudge = function(o, condition){
    // TODO-bugbug: implement undo/redo of this. Because nudge is naturally
    // called repeatedly, this should create a special collapsable history
    // point that automatically merges into the next history point if it's the
    // same type, similar to History.begin + History.group
    o.keydown.add(function(ev){
        var nudge = function(delta){
            return function(){
                delta = u._mul(1 / env.scale())(delta);
                var me = o.elements()[0];
                if (me && me.has_full_bleed()){
                    delta[me.full_coord = 0]
                }
                if (ev.shiftKey)
                    delta = u._mul(10)(delta);
                o.pos_relative_set(u._add(o.pos_relative())(delta));
            }
        }
        var handlers = {
            37: nudge([-1,0])   // Left
            , 38: nudge([0,-1]) // Up
            , 39: nudge([1,0])  // Right
            , 40: nudge([0,1])  // Down
        }
        if(handlers[ev.keyCode] && condition()){
            handlers[ev.keyCode]();
            return false;
        }
    });
};

/* Hack to prevent iframe or object in an App from capturing mouse events
 * @param {Hive.App} o The app to add shielding to
 * */
Hive.App.has_shield = function(o, opts) {
    opts = $.extend({auto: true}, opts);
    o.dragging = false;

    var clicks = 0
    o.shield = function() {
        if(o.shield_div) return;
        o.shield_div = $("<div class='drag shield'>");
        o.div.append(o.shield_div);
        clicks = 0
        o.shield_div.css('opacity', 0.0)
            .on('click', function() {
                if (++clicks > 1 && o.click_to_unshield && o.click_to_unshield())
                    o.unshield() 
            });
    }
    o.unshield = function() {
        if (opts.always) return;
        if(!o.shield_div) return;
        o.shield_div.remove();
        o.shield_div = false;
    }
    o.set_shield = function(){ return o.dragging || !o.focused() }
    o.update_shield = function(){
        if(o.set_shield()) o.shield();
        else o.unshield();
    }

    o.focus.add(o.update_shield);
    o.unfocus.add(o.update_shield);

    var start = function(){
        o.dragging = true;
        --clicks;
        o.update_shield();
    };
    var end = function(){
        o.dragging = false;
        o.update_shield();
    };

    // If auto is false, app can be shielded/unshielded but update_shield is
    // not bound to drag events, for example auto=false in text app
    if (opts.auto) {
        o.div.drag('start', start).drag('end', end);
        o.make_controls.push(function(o){
            o.div.find('.drag').drag('start', start).drag('end', end);
        });
    }
};

// coord = 0 ==> full in x dimension (y scrolling)
// coord = 1 ==> full in y dimension (x scrolling)
Hive.App.has_full_bleed = function(o, coord){
    if (!coord) coord = 0;  // default is vertical scrolling
    o.full_coord = coord;
    o.stack_coord = 1 - o.full_coord;

    // To make the functionality removable, we check that we are indeed
    // full bleed
    o.has_full_bleed = function() { return (o.full_coord != undefined); };
    // TODO: just reset the functions instead
    o.remove_full_bleed = function() { o.full_coord = undefined; };

    var _dims_relative_set = o.dims_relative_set,
        _pos_relative_set = o.pos_relative_set,
        _get_aspect = o.get_aspect,
        _resize = o.resize,
        _remove = o._remove, _unremove = o._unremove,
        push_apps, remove_delta;
    o._remove = function() {
        remove_delta = [0, 0];
        remove_delta[o.stack_coord] = o.dims()[o.stack_coord];
        o.before_resize();
        o.resize(u._mul(-1)(remove_delta));
        _remove();
    }
    o._unremove = function() {
        o.dims_ref_set();
        o.resize(remove_delta, [1, 1]);
        _unremove();
    }
    // TODO-cleanup: move to resize_start
    o.before_resize = function(){
        if(!o.has_full_bleed()) return
        o.dims_ref_set();
        // TODO-delete.  Remove junk code. 
        // Verify that resize only comes from selection now
        // env.History.begin();
        // env.History.change_start(true);
        push_apps = env.Apps.all().filter(function(a){
            return a.id != o.id;
        });
    };
    o.resize = function(delta, coords){
        if(!o.has_full_bleed()) return _resize(delta, coords)
        var start = o.max_pos()[o.stack_coord];
        _resize(delta, coords);
        var dims = o.dims_relative();
        if (o.max_height && dims[1] > o.max_height()) {
            dims[1] = o.max_height();
            o.dims_relative_set(dims);
        }
        var push = o.max_pos()[o.stack_coord] - start;

        // Move all apps below my start by delta as well
        for (var i = push_apps.length - 1; i >= 0; i--){
            var a = push_apps[i];
            if (a.min_pos()[o.stack_coord] > start - .5) {
                var pos = a.pos_relative();
                pos[o.stack_coord] += push;
                a.pos_relative_set(pos);
            }
        }

        return dims
    }
    // TODO-cleanup: move to resize_end
    o.after_resize = function(){
        if(!o.has_full_bleed()) return
        // env.History.change_end();
        // env.History.group("resize");
        env.layout_apps();
        return true;
    }
    o.get_aspect = function() {
        if (o.has_full_bleed())
            return false;
        return _get_aspect();
    }
    o.pos_relative_set = function(pos) {
        if (o.has_full_bleed()) {
            pos = pos.slice();
            pos[o.full_coord] = 0;
        }
        _pos_relative_set(pos);
    };
    o.dims_relative_set = function(dims, aspect) {
        if (o.has_full_bleed()) {
            if (aspect) {
                if (!o.full_coord)
                    aspect = 1 / aspect;
                dims[1 - o.full_coord] = 1000 * aspect;
            }
            dims[o.full_coord] = 1000;
        }
        _dims_relative_set(dims);
    };
    o.pos_relative_set(o.pos_relative());
    o.dims_relative_set(o.dims_relative());
};

// Let users drag images onto this app
// NOTE: this adds handlers to o.content_element, so if
// content_element changes, this modifier needs to be called again.
Hive.App.has_image_drop = function(o) {
    if(o.has_image_drop || !context.flags.rect_drag_drop) return o
    o.has_image_drop = true
    o.content_element.on('dragenter dragover dragleave drop', function(ev){
        // Handle drop highlighting.
        if (ev.type == "dragenter") {
            o.highlight();
        } else if (ev.type == "dragleave" || ev.type == "drop") {
            o.highlight({on: false});
        }
        ev.preventDefault();
        return false;
    });
    o.div.on("dblclick",function(ev) { 
        // TODO: decide on dbl click behavior
        ev.preventDefault()
        return; 

        env.click_app = o;
        $("#media_input").click()
    });

    var on_files = function(files, file_list){
        if (files.length == 0)
            return false;
        var load = function(app) {
            if (typeof(app.set_css) == "function")
                app.set_css(o.css_state)
        };
        // TODO-dnd: handle multiple files (auto group / image bomb algorithm)
        var file = files[0];
        // TODO-dnd: have fit depend on where the object was dropped relative
        // to image center
        var app_state = o.state()
        delete app_state.id;
        var init_state = $.extend(app_state, {fit: 2 })
        env.History.begin();
        app = u.new_file(files, init_state,
            { load:load, position: true })[0];
        if (init_state.fit == 2)
            o.remove();
        env.History.group("Image drop");
    };
    o.with_files = function(ev, file, file_list) { on_files(file, file_list)};
    upload.drop_target(o.content_element, on_files, u.on_media_upload);
    return o;
};
Hive.App.has_border_radius = function(o) {
    o.init_state.css_state = $.extend({ 'border-radius' : 0 }, 
        o.init_state.css_state);
    o.border_radius = function(){ return parseInt(o.css_state['border-radius']) };
    o.border_radius_set = function(v){ o.set_css({'border-radius':v+'px'}); };
    var controls = function(o){
        o.addButton($('#controls_rounding .rounding'));
    }
    o.make_controls.push(memoize('has_border_radius_controls', controls));
    var history_point;
    var sel = env.Selection
    Hive.App.has_slider_menu(o, '.rounding', sel.border_radius_set, sel.border_radius,
        function(){ history_point = env.History.saver(
            sel.border_radius, sel.border_radius_set, 'border radius'); },
        function(){ history_point.save() }
    );
}

var str2coords = {
      NW:[-1,-1], N:[0,-1], NE:[1,-1]
    , W: [-1, 0], C:[0, 0], E: [1, 0]
    , SW:[-1, 1], S:[0, 1], SE:[1, 1]
}

Hive.App.has_resize = function(o) {
    var dims_ref, pos_ref, history_point, resizing;
    // TODO: This ought to be in editor space
    // TODO: rename to reflect that it saves aabb
    o.dims_ref_set = function(){ 
        dims_ref = o.dims_relative(); 
        pos_ref = o.pos_relative();
    };
    o.resizing = function() {
        return resizing;
    };
    o.resize_start = function(coords){
        if (o.before_resize) o.before_resize(coords);
        env.Selection.hide_controls()
        o.dims_ref_set()
        resizing = true
        u.reset_sensitivity();
        env.History.change_start([o])
    };

    // Modifies (in-place) an axis-aligned bounding box to fit the given
    // aspect ratio by moving the edge/corner specified by coords
    // Also enforces dims[] >= 1
    var fix_aabb_for_aspect = function(aabb, coords, aspect, aspect_choice) {
        var old_dims = u._sub(aabb[1], aabb[0])
            ,dims = old_dims.map(function(x) {
                return Math.max(x, 1)
            })
        if (aspect) {
            // If unspecified, choose the aspect which makes the object smaller
            aspect_choice = (aspect_choice == undefined) ?
                (dims[1] * aspect < dims[0]) : aspect_choice
            // for edges, always choose the aspect of the edge
            if (coords[0] == 0 || coords[1] == 0)
                aspect_choice = (coords[0] == 0)
            dims = aspect_choice ? 
                [dims[1] * aspect, dims[1]] : [dims[0], dims[0] / aspect]
        }
        var dims_diff = u._sub(dims, old_dims)
        for (var i = 0; i < 2; ++i) {
            if (coords[i] == 0) {
                aabb[0][i] -= dims_diff[i] / 2
                aabb[1][i] += dims_diff[i] / 2
            } else {
                aabb[coords[i] > 0 ? 1 : 0][i] += coords[i] * dims_diff[i]
            }
        }
        return aabb
    }
    o.resize_aspect = function() {
        var aspect = o.get_aspect()
        if (!o.fixed_aspect) {
            // keep current aspect ratio
            // var old_dims = o.dims_relative()
            // keep original aspect ratio
            var old_dims = dims_ref
            if (!env.ev.shiftKey)
                aspect = false
            else
                aspect = aspect || [ old_dims[0] / old_dims[1] ]
        }
        return aspect        
    }
    o.resize = function(mouse_delta_screenspace, coords) {
        var aabb = o.resize_helper(mouse_delta_screenspace, coords, 
                !env.ev.altKey, o.resize_aspect())
            , dims = u._sub(aabb[1], aabb[0])
        o.pos_relative_set(aabb[0])
        o.dims_relative_set(dims)
    }

    o.resize_helper = function(mouse_delta_screenspace, coords, snap, aspect) {
        coords = coords || [1, 1]
        o.sensitivity = u.calculate_sensitivity(mouse_delta_screenspace);
        var scale = env.scale()
            , mouse_delta = u._div(mouse_delta_screenspace, scale)
            , delta = u._mul(coords, mouse_delta)
            // pos_delta is mouse_delta for each coordinate for which
            // coords[coord] == -1 (top and left)
            , pos_delta = $.map(mouse_delta, function(x, i) {
                if (coords[i] == -1)
                    return x
                return 0
            })
            , dims = u._add(dims_ref, delta)
            , _pos = u._add(pos_ref, pos_delta)
            , aabb = [_pos.slice(), u._add(_pos, dims)]

        aabb = fix_aabb_for_aspect(aabb, coords, aspect)
        if (snap) {
            var tuple = [[], []], snap_dist = []
            for (var i = 0; i < 2; ++i) {
                snap_dist[i] = tuple[i][coords[i] + 1] 
                    = aabb[Math.max(0, coords[i])][i]
            }
            var pos = o.snap_a_point(tuple)
            for (var i = 0; i < 2; ++i) {
                snap_dist[i] = Math.abs(snap_dist[i] - pos[i])
                aabb[Math.max(0, coords[i])][i] = pos[i]
            }
            aabb = fix_aabb_for_aspect(aabb, coords, aspect, 
                (snap_dist[0] < snap_dist[1]))
        } else
            $(".ruler").hidehide();
        return aabb
    }

    o.resize_end = function(skip_history){ 
        u.set_debug_info("");
        resizing = false;
        $(".ruler").hidehide();
        if (o.after_resize) skip_history |= o.after_resize();
        env.History.change_end("resize", {cancel: skip_history})
    };
    o.snap_a_point = function(tuple) {
        if(u.should_snap() && !env.no_snap && !o.has_full_bleed()){
            var excludes = {};
            excludes[o.id] = true;
            pos = u.snap_helper(tuple, {
                exclude_ids: excludes,
                snap_strength: .05,
                snap_radius: 10, 
                sensitivity: o.sensitivity / 2, 
            });
        }
        return pos
    }

    function controls(o) {
        var common = $.extend({}, o);
        o.resize_control = true;
        var app = o.app.sel_app();
        o.c.resize = $()
        var dirs = {}

        if (app.has_full_bleed())
            // TODO: test and replace with subset of normal resizers
            o.c.resize = o.addControl($('#controls_misc .resize_v'));
        else {
            dirs = {SE: 1}
            if (context.flags.Editor.resize_nw) {
                $.extend(dirs, {NW: 1 })
            }
            if (context.flags.Editor.resize_all) {
                $.extend(dirs, {
                    NW: 1 ,N: 1 ,NE: 1
                    ,W: 1 /* ,C: 1 */,E: 1
                    ,SW: 1 ,S: 1 ,SE: 1
                })
            }
        }
        o.resizers = {}
        if (o.single() && o.single().type.tname == "hive.text") {
            delete dirs.N
            delete dirs.S
        }
        for (var dir in dirs) {
            var $handle = o.addControl($('#controls_misc .resize'))
                ,coords = str2coords[dir]
                ,angle = Math.atan2(coords[1], coords[0])
            // in case handles aren't symetrical
            // $handle.data("coords", coords)
            //     .css({'transform': 'translate(-20px, -20px) rotate(' + angle +
            //         'rad) translate(-15px, 10px)', 'cursor': dir + '-resize'})
            $handle.data("coords", coords).css({'cursor': dir + '-resize'})
            o.c.resize = o.c.resize.add($handle)
            o.resizers[dir] = $handle
        }

        var control_pos = function(dims, padding, coords) {
            var coords = coords.map(u._sign)
                ,center = u._mul(.5, dims)
                ,pos = u._add(center, u._mul(center, coords))
                ,pos_padded = u._add(pos, u._mul(padding, coords))
            return pos_padded
        }
        o.layout = function() {
            common.layout()
            var p = o.padding;
            var dims = o.dims();
            if (app.has_full_bleed())
                o.c.resize.css({ top: dims[1] - 13 + o.padding,
                    left: Math.min(dims[0] / 2 - 13, dims[0] - 54) });
            else 
                // o.c.resize.css({ left: dims[0] -13 + p, top: dims[1] - 13 + p });
            for (var dir in o.resizers) {
                var coords = str2coords[dir]
                o.resizers[dir].css(ui_util.array2css(
                    u._add([0, 0], control_pos(dims, p + 2, coords))))
            }
        };

        var resize_coords = [1, 1]
        o.c.resize.drag('start', function(ev, dd) {
            resize_coords = $(this).data("coords") || [1, 1]
            if (app.cropping_active) {
                ev.data = app
                app.begin_crop(ev)
            }
            o.drag_target = ev.target;
            o.drag_target.busy = true;
            o.app.resize_start(resize_coords);
        })
        .drag(function(e, dd){ 
            env.ev = e; 
            o.app.resize([ dd.deltaX, dd.deltaY ], resize_coords)
        })
        .drag('end', function(e, dd){
            o.drag_target.busy = false;
            o.app.resize_end();
        });

        return o;
    }
    if (o.is_selection)
        o.make_controls.push(controls);
}

Hive.App.has_resize_h = function(o) {
    function controls(o) {
        var common = $.extend({}, o);

        // This control can only ever apply to a single app.
        var app = o.app.elements()[0];

        o.addControl($('#controls_misc .resize_h'));
        o.c.resize_h = o.div.find('.resize_h');
        o.refDims = null;

        o.layout = function() {
            common.layout()
            var p = o.padding;
            var dims = o.dims();
            o.c.resize_h.css({ left: dims[0] -18 + o.padding,
                top: Math.min(dims[1] / 2 - 18, dims[1] - 54) });
        }

        // Dragging behavior
        o.c.resize_h.drag('start', function(e, dd) {
                if (app.before_h_resize) app.before_h_resize();
                o.refDims = app.dims();
                o.drag_target = e.target;
                o.drag_target.busy = true;
                app.div.drag('start');
            })
            .drag('end', function(e, dd) {
                o.drag_target.busy = false;
                app.div.drag('end');
                // if (env.Selection.selected(app)) 
                env.Selection.update_relative_coords();
            })
            .drag(function(e, dd) { 
                app.resize_h([ o.refDims[0] + dd.deltaX, o.refDims[1] ]);
            });

        return o;
    }
    o.resize_h = function(dims) {
        return o.dims_set([ dims[0], o.calcHeight() ]);
    }
    o.make_controls.push(controls);
}

Hive.has_scale = function(o){
    var scale = o.init_state.scale ? o.init_state.scale * env.scale() : 1;
    o.scale = function(){ 
        return scale; };
    o.scale_set = function(s){ 
        scale = s; o.layout(); };

    /////////////////////////////////////////////////////////////////////////
    // Saveable
    o.history_state.add(function() {
        var s = { 'scale': scale}
        $.extend(o.history_state.return_val, s)
    })
    o.history_state_set.add(function(s) {
        if(s.scale) o.scale_set(s.scale);
    })
    /////////////////////////////////////////////////////////////////////////
};

Hive.App.has_toggle = function(o, toggle_name){
    var history_point, sel = env.Selection, toggle_set = toggle_name + "_set"
    o[toggle_name] = function() {
        return o.client_data(toggle_name) || false
    }
    o[toggle_set] = function(v) {
        o.client_data_set(toggle_name, v)
        // fixup_controls(sel.controls)
    }
    o["toggle_" + toggle_name] = function() {
        o[toggle_set](!o[toggle_name]())
    }
    // set the selection delegates
    if (!sel[toggle_name]) {
        sel.set_standard_delegate(toggle_name)
        sel.set_standard_delegate(toggle_set)
    }
    
    var controls = function (o) {
        find_or_create_button(o, '.' + toggle_name)
        .click(function(ev) {
            history_point = env.History.saver(
                sel[toggle_name], sel[toggle_set], toggle_name)
            sel.toggle_func(toggle_name) 
            history_point.save()
            fixup_controls(o)
        })

        return o;
    };
    // Set the correct "on" state for the control icon (off unless all selected
    // apps are on)
    var fixup_controls = function(o) {
        var $control = $("#controls ." + toggle_name)
            ,png = $control.prop("src")
            ,png_off = png.replace("-on.png", ".png")
            ,asset = ui_util.asset_name_from_url(png_off).slice(0, -4)
            ,toggle = sel[toggle_name]() ? "-on" : ""
        $control.prop("src", ui_util.asset(asset + toggle + ".png"))
    }
    fixup_controls.display_order = 9
    o.make_controls.push(memoize('has_' + toggle_name + '_fixup', fixup_controls))
    o.make_controls.push(memoize('has_' + toggle_name, controls));
    return controls
}
Hive.App.has_autoplay = function(o){
    return Hive.App.has_toggle(o, "autoplay")
}
Hive.App.has_live_edit = function(o){
    return Hive.App.has_toggle(o, "liveedit")
}
Hive.App.has_fixed = function(o){
    var controls = Hive.App.has_toggle(o, "fixed")
    var _fixed_set = o.fixed_set
    // TODO-cleanup: override default behavior of fixed and fixed_set
    // to use css_state instead of client_data
    o.fixed_set = function(v) {
        _fixed_set(v)
        if (v)
            o.css_state['position'] = 'fixed'
        else
            delete o.css_state['position']
    }
    o.fixed_set(o.fixed())
    return controls
}
Hive.App.has_autohide = function(o){
    var controls = Hive.App.has_toggle(o, "autohide")
    var _autohide_set = o.autohide_set
    o.autohide_set = function(v) {
        _autohide_set(v)
        if (v)
            o.css_state['visibility'] = 'hidden'
        else
            delete o.css_state['visibility']
    }
    return controls
}

Hive.App.has_crop = function(o) {
    var sel = env.Selection
    o.cropping_active = false

    o.unfocus.add(function() {
        if (o.cropping_active) {
            o.cropping_active = false
            o.crop_ui_showhide(false)
        }
    })

    var controls = function (o) {
        var app = o.app.sel_app(), $hidden_controls

        var fixup_controls = function(o) {
            var $control = $("#controls .crop")
                ,toggle = app.cropping_active ? "-on" : ""
                ,$control_parent = $("#controls .crop").parents(".controls")
                ,$hidden_controls = $hidden_controls || $control_parent
                    .find(":visible").not(".hide").not(".crop,.buttons,.resize,.select_border")
            $control.prop("src", ui_util.asset("skin/edit/crop" + toggle + ".png"))
            // $hidden_controls.toggleClass("hidden", app.cropping_active)
            $hidden_controls.css("visibility", app.cropping_active ? "hidden" : "")
            if (context.flags.Editor.crop_move_border)
                $control_parent.find(".select_border").css("pointer-events",
                    app.cropping_active ? "none" : "")
        }
        find_or_create_button(o, '.crop')
        .click(function(ev) {
            app.cropping_active = !app.cropping_active
            app.crop_ui_showhide(app.cropping_active)
            fixup_controls(o)
        })

        fixup_controls(o)
        return o
    }
    controls.display_order = 7
    controls.single = true
    o.make_controls.push(memoize('has_crop', controls));
}

Hive.App.has_rotate = function(o) {
    function controls(o) {
        var common = $.extend({}, o), ref_angle = null, offsetAngle = null,
            ref_centroid, app = o.app.sel_app();

        o.getAngle = function(e) {
            var x = e.pageX - ref_centroid[0];
            var y = e.pageY - ref_centroid[1];
            return Math.atan2(y, x) * 180 / Math.PI;
        }

        o.layout = function() {
            common.layout();
            var p = o.padding;
            var dims = o.dims();
            o.rotateHandle.css({ left: dims[0] + 15 + o.padding,
                top: dims[1] / 2 - 16 });
            env.Selection.each(function(i,a){
                if(a.controls)
                    a.controls.select_box.rotate(a.angle()) })
        }

        o.rotate = function(a){
            app.angle_set(a);
        };

        o.rotateHandle = $("<img class='control rotate hoverable drag' title='Rotate'>")
            .attr('src', asset('skin/edit/rotate.png'));
        o.appendControl(o.rotateHandle);

        var angleRound = function(a) { return Math.round(a / 45)*45; },
            history_point;
        o.rotateHandle.drag('start', function(e, dd) {
                ref_centroid = app.centroid()
                ref_angle = app.angle();
                offsetAngle = o.getAngle(e);
                env.Selection.hide_controls()
                if (app.rotate_start)
                    app.rotate_start(ref_angle);
                if(!app.is_selection)
                    history_point = env.History.saver(
                        app.angle, app.angle_set, 'rotate');
            })
            .drag(function(e, dd) {
                var a = o.getAngle(e) - offsetAngle + ref_angle;
                if( e.shiftKey && Math.abs(a - angleRound(a)) < 10 )
                    a = angleRound(a);
                app.angle_set(a);
            })
            .drag('end', function(){
                if(app.rotate_end) app.rotate_end();
                env.Selection.update_relative_coords();
                env.Selection.show_controls()
                if(!app.is_selection)
                    history_point.save()
            })
            .dblclick(function(ev){ 
                if(app.is_selection)
                    return;
                history_point = env.History.saver(
                    app.angle, app.angle_set, 'rotate');
                app.angle_set(0); 
                env.Selection.update_relative_coords();
                history_point.save()
            });

        return o;
    }
    if (!o.is_selection) {
        var angle = o.init_state.angle ? o.init_state.angle : 0;
        o.angle = function(){ return angle; };
        o.angle_set = function(a){
            angle = a
            o.div.rotate(a)
        }
        o.load.add(function() { o.angle_set(o.angle()) });

        /////////////////////////////////////////////////////////////////////////
        // Saveable
        o.history_state.add(function() {
            var s = {}
            if(angle === 0 || angle) s.angle = angle;
            $.extend(o.history_state.return_val, s)
        })
        o.history_state_set.add(function(s) {
            if(s.angle === 0 || s.angle)
                o.angle_set(s.angle)
        })
        /////////////////////////////////////////////////////////////////////////
    }
    o.make_controls.push(memoize("rotate_controls", controls));
}

var has_menu = function(handle_jq, opts) {
    var o = {}
    opts = $.extend({
        single: false // make this menu only available to singly-selected apps
        , filter: null      // only show controls if (filter(app))

        , container:null // add controls to container instead of menu
        , handle:$()  // provide the handle selector instead of looking for it
        , handle_name:"" // provide a generic button's name instead of an icon
        , drawer_jq:""    // selector for the drawer's prototype in sandbox

        , menu_opts:null // pass options to the menu constructor

        , start:noop        // called at menu creation (history etc.)
        , end:noop          // called at menu completion (history etc.)
        , init:noop         // f(): called to retrieve initial state
        , set:noop          // f(v): called to set value
    }, opts)
    var single = opts.single, filter = opts.filter
        , container = opts.container, handle = opts.handle
        , handle_name = opts.handle_name, drawer_jq = opts.drawer_jq
        , menu_opts = opts.menu_opts
        , start = opts.start || noop, end = opts.end || noop
        , init = opts.init || noop, set = opts.set || noop
        , initial, val //, initialized = false
    o.app = opts.app

    o.initialize = function(){
        initial = val = init()
        o.val_set(val, false)
    }
    o.val_set = function(v, doit) {
        val = v
        if (doit !== false) 
            set(v)
    }
    o.val = function() { return val }
    o.render = function() { return $(drawer_jq).clone() }
    o.attach_handlers = function() {}
    o.controls = function(controls) {
        if (filter && !filter(o.app)) return
        var hover_menu = (controls && controls.hover_menu) || u.hover_menu

        o.drawer = o.render()
        if (container) {
            o.drawer.appendTo(container)
        } else {
            handle = find_or_create_button(controls, handle_jq, handle_name);
            handle.parent().append(o.drawer)
        }
        // For named handles with no icon, give them the text of the first 
        // character of their name
        if (handle_name && !handle_jq) {
            handle.html(handle_name[0]);
        }

        o.handle = $()
        if (handle && handle.length) {
            o.handle = handle
            o.menu = hover_menu(handle, o.drawer, $.extend (
                menu_opts, {
                open: function(){
                    o.initialize()
                    start()
                    o.drawer.find("input").focus()
                    o.drawer.find("textarea,input[type=text]").focus()
                },
                close: function(){
                    if(o.val() != initial) end()
                }
            }))
        }
        o.attach_handlers()
        return controls
    }
    if (o.app) {
        if (single) o.controls.single = true
        o.controls = memoize('slider' + ((single) ? '_S' : '') + 
            handle_jq + handle_name, o.controls)
        o.app.make_controls.push(o.controls)
    }
    return o
}

Hive.App.has_text_menu = function(handle_jq, opts) {
    opts = $.extend({
        drawer_jq:"#control_drawers .generic_edit"
    }, opts)
    var o = has_menu(handle_jq, opts), edit
    var _val_set = o.val_set
    o.val_set = function(v) {
        _val_set(v)
        edit.val(v)
    }
    o.attach_handlers = function() {
        edit = o.drawer.find("input")

        edit.on('input keyup change', function(ev){
            if(ev.keyCode == 13) { edit.blur(); o.menu.close(); }
            _val_set(edit.val())
        }).focus()
    }
    return o
}

// set: f(v): tell the app to set its state to the slider value
// init: f(): get the app's state
// start: called on menu open (for history)
// end: called on menu close (for history)
Hive.App.has_slider_menu = function(app, handle_jq, set, init, start, end, opts) {
    opts = $.extend({
          min:0       // minimum setting on range
        , max:100     // maximum setting on range
        , quant:0     // quantization of slider (1 ==> integers .1 ==> integer/10, etc)
        , clamp:true  // disallow values outside [min, max]
        , clamp_min:true  // disallow values outside [min, max]
        , clamp_max:true  // disallow values outside [min, max]

        , set:set, init:init, start:start, end:end, app:app
    }, opts)
    var o = has_menu(handle_jq, opts)
    var min = opts.min, max = opts.max, quant = opts.quant
        , clamp_min = opts.clamp_min && opts.clamp
        , clamp_max = opts.clamp_max && opts.clamp

    var num_input, range, val, _initialize = o.initialize
    o.initialize = function() {
        _initialize()
        num_input.focus().select()
        val = o.val();
        update_val()
    }
    o.render = function() {
        var drawer = $('<div>').addClass('control border drawer slider hide')
        range = $("<input type='range' min='0' max='100'>")
                .appendTo(drawer)
                .css('vertical-align', 'middle')
        num_input = $("<input type='text' size='3'>")
                .appendTo(drawer)
        return drawer
    }
    o.attach_handlers = function() {
        o.handle.add(o.drawer).bind('mousewheel', function(e){
            // Need to initialize here because mousewheel can fire before 
            // menu is opened
            val = val || init();
            var amt = (e.originalEvent.wheelDelta / 2000) || 0
            clamp_set((val || min) + amt*(max - min))
            update_val()
            e.preventDefault()
        })

        range.on('input change', function(){
            var v = parseFloat(range.val());
            val = v/100*(max - min) + min
            clamp_set(val)
            update_val()
            // num_input.val(val)
        })

        num_input.on('input keyup change', function(ev){
            if(ev.keyCode == 13) { num_input.blur(); o.menu.close(); }
            var v = parseFloat(num_input.val());
            if(isNaN(v)) return;
            val = v;
            clamp_set(val);
            update_val({num_input:false})
        })
    }
    var clamp_set = function(n) {
        val = n
        if (quant)
            val = Math.round(val / quant) * quant;
        if (clamp_min) val = Math.max(val, min)
        if (clamp_max) val = Math.min(val, max)
        // set(val)
        o.val_set(val)
        return val
    }

    var update_val = function(opts){
        opts = $.extend({num_input:true, range:true}, opts)
        if (typeof(val) == "number") {
            if (opts.num_input) num_input.val((Math.round(val*1000)/1000).toString())
            if (opts.range) range.val((val - min)/(max - min)*100)
        } else {
            if (opts.num_input) num_input.val()
            if (opts.range) range.val(0)
        }
        // o.val_set(val)
    }

    return o
}

Hive.App.has_align = function(o) {
    function controls(o) {
        var common = $.extend({}, o);

        o.addButton($('#controls_misc .button.align'));
        o.addButton($('#controls_misc .drawer.align'));
        // o.c.align = o.div.find('.align.button');
        o.align_menu = o.hover_menu(o.div.find('.button.align'), 
            o.div.find('.drawer.align'));

        o.div.find('[canvas]').each(function(i, el) {
            var $el = $(el)
            $el.on('mousedown', function(e) {
                e.preventDefault();
            }).click(function(){
                env.History.change_start([o.app]);
                var type = parseInt($el.attr('type'))
                    ,canvas = parseInt($el.attr('canvas'))
                    ,coord = parseInt($el.attr('coord'))
                    ,aabb = o.app.aabb()
                    ,alignment = [-1, -1]
                    ,opts = { padding: "auto" }
                alignment[coord] = type

                if (canvas) {
                    var $win = $(window), pos = env.scroll.slice()
                        ,dims = [$win.width(), $win.height()]
                        ,s = env.scale() / env.zoom()
                    aabb = [u._div(pos, s), u._div(u._add(pos, dims), s)]
                }

                if (type == -1) {
                    if (env.Selection.group_count() == 1)
                        alignment[coord] = 3
                    else
                       opts.stack = 1 - coord
                }
                realign(env.Selection.groups(), alignment, aabb, opts)
                env.Selection.update_relative_coords();

                // var width = 1000
                //     ,pos = o.app.pos_relative()
                //     ,dims = o.app.dims_relative()
                // switch(type) {
                //   case 0:
                //     pos[coord] = 0;
                //     break;
                //   case 1:
                //     pos[coord] = width - dims[coord];
                //     break;
                //   case 2:
                //     pos[coord] = (width - dims[coord]) / 2;
                //     break;
                //   case 3:
                //     pos[coord] = 0;
                //     dims[coord] = width;
                //     var app = o.app;
                //     var aspect = app.get_aspect();
                //     if (aspect) {
                //         if (!coord) aspect = 1 / aspect;
                //         dims[1 - coord] = width * aspect;
                //     } else if (app.is_selection && app.count() == 1) {
                //         app = app.elements()[0];
                //         dims[1 - coord] = app.dims_relative()[1 - coord];
                //     }
                //     app.dims_relative_set(dims);
                //     break;
                // }
                // o.app.pos_relative_set(pos);
                env.History.change_end("align");
            });
        });

        return o;
    };
    o.make_controls.push(memoize('has_align_controls', controls));
    var fixup_controls = function(o) {
        o.div.find("[canvas=0]").showhide(env.Selection.group_count() > 1)
    }
    fixup_controls.display_order = 9
    o.make_controls.push(memoize('has_align_controls_fixup', fixup_controls))
};
    
Hive.App.has_opacity = function(o) {
    var history_point;
    var app = env.Selection;
    Hive.App.has_slider_menu(o, '.button.opacity',
        function(v) { app.opacity_set(v/100) },
        function() { return Math.round(app.opacity() * 100) },
        function(){ history_point = env.History.saver(
            app.opacity, app.opacity_set, 'change opacity') },
        function(){ history_point.save() }
    );
    var opacity = o.init_state.opacity === undefined ? 1 : o.init_state.opacity; 
    o.opacity = function(){ return opacity; };
    o.opacity_set = function(s){
        opacity = s;
        o.content_element.css('opacity', s);
    };

    /////////////////////////////////////////////////////////////////////////
    // Saveable
    o.history_state.add(function(){
        var s = {}
        if(opacity != 1) s.opacity = opacity;
        $.extend(o.history_state.return_val, s)
    });
    /////////////////////////////////////////////////////////////////////////

    o.load.add(function(){
        if (o.content_element)
            o.opacity_set(opacity);
    });
};

// opts.name: function to call to get the value
// opts.setter: function to call to set the value
// opts.slider_opts: options to pass to slider
Hive.App.has_border_width = function(o, opts) {
    opts = $.extend({name:"border_width"}, opts)
    var history_point, sel = env.Selection
        ,getter = opts.name, setter = opts.setter || getter + "_set"
    // If getter/setter undefined, default to globals
    if (!o[getter]) o[getter] = o['g' + getter]
    if (!o[setter]) o[setter] = o['g' + setter]

    Hive.App.has_slider_menu(o, '.stroke-width'
        ,function(v){
            sel[setter](v)
        }
        ,sel.border_width
        ,function(){ history_point = env.History.saver(
            sel[getter], sel[setter], 'stroke') }
        ,function(){
            history_point.save()
            sel.reframe()
        }
        ,$.extend({max:40, clamp_max:false, quant:1}, opts.slider_opts)
    )
}
Hive.App.has_blur = function(o) {
    var history_point, sel = env.Selection
    Hive.App.has_slider_menu(o, '.blur' ,sel.blur_set ,sel.blur
        ,function(){ history_point = env.History.saver(
            sel.blur, sel.blur_set, 'stroke') }
        ,function(){
            history_point.save()
            sel.reframe()
        }
    )
}
var find_or_create_button = function(controls, btn_name, btn_title) {
    var btn = controls.div.find('.button' + btn_name);
    if (!btn_name || !btn.length) {
        btn = controls.addButton($('#controls_misc .button' + (btn_name || ".run")));
        if (btn_title) {
            btn.attr("title", btn_title);
            if (!btn_name)
                btn.html(btn_title[0]);
        }

    }
    return btn;
}

Hive.App.has_color = function(o, name){
    if(!name) name = 'color'
    if (!o[name]) o[name] = o['g' + name]
    if (!o[name + "_set"]) o[name + "_set"] = o['g' + name + "_set"]
    o.make_controls.push(memoize('has_color_' + name, function(o) {
        var common = $.extend({}, o);
        var color_drawer, sel = env.Selection
            ,getter = sel[name], setter = sel[name + '_set']

        // o.addButton($('#controls_misc .drawer.color'));
        // o.addButton($('#controls_misc .button.color'));
        // o.c.color = o.div.find('.button.color');
        color_drawer = o.addButton($('#controls_misc .drawer.color'));
        o.c.color = find_or_create_button(o, "." + name);
        u.append_color_picker(color_drawer, setter, getter());
        var history_point
        o.hover_menu(o.c.color, color_drawer, {
            auto_close: false
            ,open: function(){
                history_point = env.History.saver(
                    getter, setter, 'color')
            }
            ,close: function(){ history_point.save() }
        });
        return o;
    }))
}

// TODO-cleanup: move background functionality here
Hive.App.Background = function(o) {
    var o = {}
    o.layout = function(){
        layout.img_fill(o.$img, 
            [o.$img.prop('naturalWidth'), o.$img.prop('naturalHeight')], $(window))
        var canvas_size = env.canvas_size()
        o.div.width(canvas_size[0]).height(canvas_size[1]).css('left', env.offset[0])
    }

    o.div = $('#bg')
    o.$img = o.div.find('img')

    return o
}

//TODO: integrate this code into root app
Hive.init_background_dialog = function(){
    if(!env.Exp.background) env.Exp.background = { };
    if(!env.Exp.background.color) env.Exp.background.color = '#FFFFFF';
    Hive.bg_div = $('#bg');
    u.append_color_picker($('#color_pick'), Hive.bg_color_set,
        env.Exp.background.color);
    
    $('#image_background').click(function() {
        var history_point;
        u.show_dialog('#dia_edit_bg', {
            fade: false,
            open: function(){ history_point = env.History.saver(
                function(){ return $.extend(true, {}, env.Exp.background) },
                Hive.bg_set, 'change background'
            ) },
            close: function(){ history_point.save() }
        });
    });

    $('#bg_remove').click(function(){
        delete env.Exp.background.url;
        Hive.bg_set({});
    });

    $('#bg_opacity').focus(function() { $('#bg_opacity').focus().select() }).keyup(function(e) {
        env.Exp.background.opacity = parseFloat($(e.target).val()) / 100;
        Hive.bg_set(env.Exp.background);
    });

    $('#bg_upload').on('with_files', function(ev, files){
        Hive.bg_set(files[0]);
    }).on('success', function(ev, files){
        env.Exp.background.url = files[0].url;
        env.Exp.background.file_id = files[0]["id"];
        env.Exp.background.file_name = files[0]["name"];
    });
};
Hive.bg_color_set = function(c) {
    if(!c) c = '';
    Hive.bg_div.add('#bg_preview').css('background-color', c);
    env.Exp.background.color = c;
};
Hive.bg_set = function(bg, load) {
    env.Exp.background = bg;
    Hive.bg_color_set(bg.color);

    var img = Hive.bg_div.find('img')
        ,imgs = img.add('#bg_preview_img')
        ,raw = false;
    try {
        raw = $(bg.content)
    } catch(e){}

    $('#bg .content').remove()
    if(raw.length) {
        imgs.hidehide();
        raw.appendTo(Hive.bg_div).showshow();
        return;
    }

    if(bg.url) imgs.showshow();
    else { imgs.hidehide(); return }

    imgs.attr('src', bg.url);
    img.load(function(){
        env.Background.layout()
        if(load) load()
    });
    if(bg.opacity) imgs.css('opacity', bg.opacity);
};
Hive.bg_change = function(s){
    env.History.saver(
        function(){ return $.extend(true, {}, env.Exp.background) },
        Hive.bg_set, 'change background'
    ).exec(s);
};

Hive.rect_test = function(w, h){
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

return Hive;
});
