define([ 
    "./util"
    ,"./env"
    ], function(u, env){

// TODO-cleanup: fix dependencies
var o = env

o.History = [];
o.History.init = function(){
    var o = env.History, group_start, group_level = 0;
    o.current = -1;

    o.saves_pending = function() {
        return group_level + savers_pending
    }
    o.savers = function() {
        return savers_pending
    }
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

    o.undo = function(count){
        if (count < 1 || ! o[o.current]) {
            o.update_btn_titles();
            env.layout_apps();
            env.exit_safe_set(o.current == -1)
            return false
        }
        count = count || 1

        o[o.current].undo();
        o.current -= 1;
        return o.undo(count - 1);
    };

    o.redo = function(count){
        count = (count === undefined) ? 1 : count
        var next = o[ o.current + 1 ];
        if (count < 1 || !next) {
            o.update_btn_titles();
            env.layout_apps();
            return false
        }

        next.redo();
        o.current += 1;
        return o.redo(count - 1);
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
    var savers_pending = 0;
    o.saver = function(getter, setter, name){
        var o2 = { name: name }
            , unsaved = true;
        o2.old_state = getter("history");
        savers_pending++;

        o2.save = function(){
            if (unsaved) {
                unsaved = false;
                savers_pending--;
            }
            o2.new_state = getter(o2.old_state, "history");
            // don't save noop
            if (u.array_equals(o2.old_state, o2.new_state))
                return;
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
        if (!save_targets.slice(-1)[0]) return [];
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
        savers_pending++
    };
    o.change_end = function(name, opts){
        opts = $.extend({
            collapse: false   // collapse undos with the same name and app list
            cancel: false
        }, opts)
        savers_pending--
        if (opts.cancel)
            return
        
        var new_states = get_states()
            ,targets = save_targets.length ? save_targets.pop().slice() : []
            ,start_states = old_states.length ? old_states.pop().slice() : []
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
    $('#btn_undo').click(function(ev) {
        env.History.undo(ev.shiftKey ? 10 : 1)
    });
    $('#btn_redo').click(function(ev) {
        env.History.redo(ev.shiftKey ? 10 : 1)
    });
};


return o;
});

