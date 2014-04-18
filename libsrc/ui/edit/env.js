define([], function(){

var env = o = {};
// env.padding = 10;
env.show_move_sensitivity = false;
env.no_snap = false;
env.show_mini_selection_border = false
env.copy_table = false;

// 1 editor unit := scale client pixels
// The editor is 1000 units wide inside a 1000*scale pixel window
var scale = 1, zoom = 1, padding = 10
o.scale_set = function(){
    scale = zoom * $(window).width() / 1000;
};
o.scale = function(){
    return scale;
};
o.zoom_set = function(_zoom) {
    zoom = _zoom;
    env.layout_apps();
}
o.zoom = function(){ return zoom; };
o.padding = function() { return padding; };
o.padding_set = function(_padding) { padding = _padding; };

// TODO: move these to user record
o.tiling = { 
    aspect: .5*(Math.sqrt(5) + 1)
    ,columns: 3.5
    ,padding: 10
}

o.History = [];
o.History.init = function(){
    var o = env.History, group_start, group_level = 0;
    o.current = -1;

    // These two methods are used to collapse multiple history actions into one. Example:
    //     env.History.begin()
    //     // code that that creates a lot of history actions
    //     env.History.group('group move')
    // TODO: replace begin and group with existing version of saver
    o.begin = function(){
        if (! group_level++)
            group_start = o.current + 1 
    };
    o.group = function(name){
        if (--group_level)
            return;
        var group_length = o.current - group_start + 1;
        if(group_length < 1) return;
        post_change = env.Selection.update;
        var action_group = o.splice(group_start, group_length);
        o.save(
            function(){ $.map(action_group.slice().reverse(), 
                function(e){ e.undo() }); post_change() },
            function(){ $.map(action_group, function(e){ e.redo() }); post_change() },
            name
        );
        o.current = group_start;
        o.update_btn_titles();
    };

    // pushes an action into the history stack
    o.save = function(undo, redo, action_name, misc){
        if( o[o.current + 1] ) o.splice(o.current + 1); // clear redo stack when saving
        o.push({ undo: undo, redo: redo, name: action_name, misc: misc });
        o.current += 1;
        o.update_btn_titles();
        env.exit_safe_set(false)
    };

    o.undo = function(){
        if(! o[o.current]) return false;
        o[o.current].undo();
        o.current -= 1;
        o.update_btn_titles();
        env.layout_apps();
        env.exit_safe_set(o.current == -1)
        return false;
    };

    o.redo = function(){
        var next = o[ o.current + 1 ];
        if( ! next ) return false;
        next.redo();
        o.current += 1;
        o.update_btn_titles();
        env.layout_apps();
        return false;
    };
        
    o.update_btn_titles = function(){
        var current = o[o.current], next = o[ o.current + 1 ];
        $('#btn_undo').attr('title', current ? 'undo ' + current.name : 'nothing to undo');
        $('#btn_redo').attr('title', next ? 'redo ' + next.name : 'nothing to redo');
    };

    // Wrapper around o.save() for creating a history action from a getter and a setter
    // instead of an undo redo action. This is useful for the pattern of:
    //     var history_point = env.History.saver(get_foo_state, set_foo_state, 'foo');
    //     // perform some action that changes foo state
    //     history_point.save();
    // There is also history_point.exec(foo_state) for the case where no user interaction is
    // needed to change the state
    o.saver = function(getter, setter, name){
        var o2 = { name: name };
        o2.old_state = getter("history");

        o2.save = function(){
            o2.new_state = getter(o2.old_state, "history");
            o.save(
                function(){ setter(o2.old_state, "history") },
                function(){ setter(o2.new_state, "history") },
                o2.name
            );
        };

        o2.exec = function(state){
            setter(state);
            o2.save();
        };

        return o2;
    };

    //// BEGIN-Utility functions
    var old_states = [], save_targets = [];
    var get_states = function(){
        return save_targets.slice(-1)[0].map(function(a){ return a.state_relative(); }) 
    };
    // apps == true: save all state
    // apps == false: save selection state
    // else apps = list of apps to save
    o.change_start = function(apps){
        if (typeof(apps) != "object") {
            if (!apps) 
                apps = env.Selection.get_targets();
            else
                apps = env.Apps.all();
        }
        var targets = apps.slice();
        if (targets[0] && targets[0].is_selection)
            targets = env.Selection.get_targets();
        save_targets.push(targets);
        old_states.push(get_states());
    };
    o.change_end = function(name, opts){
        opts = $.extend({
            collapse: false   // collapse undos with the same name and app list
        }, opts)
        var new_states = get_states(), targets = save_targets.pop().slice()
            ,start_states = old_states.pop().slice()
            ,last_save = o.slice(o.current)[0]
            ,undo = function(){ $.each(targets, function(i, a){
                a.state_relative_set(start_states[i]) }) }
            ,redo = function(){ $.each(targets, function(i, a){
                a.state_relative_set(new_states[i]) }) }

        if (opts.collapse && last_save && last_save.name == name 
            && env.util.array_equals(last_save.misc, targets))
        {
            undo = last_save.undo
            o.splice(o.current--)
        }
        o.save(undo, redo, name, targets);
    };
    ///////////////

    o.update_btn_titles();
    $('#btn_undo').click(env.History.undo);
    $('#btn_redo').click(env.History.redo);
};


return o;
});
