define([
], function(
){

var env = o = {};
env.show_move_sensitivity = true;
env.no_snap = false;

// 1 editor unit := scale client pixels
// The editor is 1000 units wide inside a 1000*scale pixel window
var scale = 1;
o.scale_set = function(){
    scale = $(window).width() / 1000;
};
o.scale = function(){
    return scale;
};


o.History = [];
o.History.init = function(){
    var o = env.History, group_start;
    o.current = -1;

    // These two methods are used to collapse multiple history actions into one. Example:
    //     env.History.begin()
    //     // code that that creates a lot of history actions
    //     env.History.group('group move')
    // TODO: replace begin and group with existing version of saver
    o.begin = function(){ group_start = o.current + 1 };
    o.group = function(name){
        var group_length = o.current - group_start + 1;
        if(group_length < 1) return;
        post_change = env.Selection.update;
        var action_group = o.splice(group_start, group_length);
        o.save(
            function(){ $.map(action_group, function(e){ e.undo() }); post_change() },
            function(){ $.map(action_group, function(e){ e.redo() }); post_change() },
            name
        );
        o.current = group_start;
        o.update_btn_titles();
    };

    // pushes an action into the history stack
    o.save = function(undo, redo, action_name){
        if( o[o.current + 1] ) o.splice(o.current + 1); // clear redo stack when saving
        o.push({ undo: undo, redo: redo, name: action_name });
        o.current += 1;
        o.update_btn_titles();
    };

    o.undo = function(){
        if(! o[o.current]) return false;
        o[o.current].undo();
        o.current -= 1;
        o.update_btn_titles();
        return false;
    };

    o.redo = function(){
        var next = o[ o.current + 1 ];
        if( ! next ) return false;
        next.redo();
        o.current += 1;
        o.update_btn_titles();
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
        o2.old_state = getter();

        o2.save = function(){
            o2.new_state = getter();
            o.save(
                function(){ setter(o2.old_state) },
                function(){ setter(o2.new_state) },
                o2.name
            );
        };

        o2.exec = function(state){
            setter(state);
            o2.save();
        };

        return o2;
    };

    o.update_btn_titles();
    $('#btn_undo').click(env.History.undo);
    $('#btn_redo').click(env.History.redo);
};


return o;
});