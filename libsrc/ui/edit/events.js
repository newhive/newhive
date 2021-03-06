define([
    'jquery'
], function(
    $
){
    // Event handling with custom bubbling: dispatches events to specified
    // list of handlers (_handlers) in order.
    // All handlers must have an integer handler_type property,
    // which specifies bubble order

    // TODO-minor-bugbug: implement a concept of a default handler (maybe
    // reverse order of handler_type and make 0 default), so, for example,
    // hover states can be disabled between all dragstart and dragend events
	var o = {};

	var _handlers = [];
	o.handler_set = function(handler){
		_handlers[handler.handler_type] = handler;
	};
	o.handler_del = function(handler){
		_handlers[handler.handler_type] = false;
	};
	o.handlers = function(){ return _handlers.slice(); };
    var focused = true;
    o.focus = function(){
        focused = true };
    o.unfocus = function(){
        focused = false };
    o.focused = function(){
        // return first thing in _handlers
        for(var i = 0; i<_handlers.length; i++)
            if(_handlers[i]) return _handlers[i]
    }

    // Create an event handler that dispatches to the current (focused)
    // _handlers in order, optionally starting at the given handler first and
    // bubbling to the handlers in _handlers after handler.handler_type.
    // Bubbling halts when a handler returns a defined falsey value
    var event_bubbler = function(event_name, data){
        return (function(ev){
            if( !focused || ($.inArray(event_name,
                ["keyup", "keypress", "keydown"]) >= 0 && $(":focus").length)
            ){
                // _stopPropagation();
                return;
            }
            ev.data = data;

            // patch native event with hacked stopPropagation that encompasses
            // our custom bubbling.
            var _stopPropagation = ev.stopPropagation, do_stop = false;
            ev.stopPropagation = function(){
                do_stop = true
                _stopPropagation.apply(ev)
            };
            ev.stop_editor_propagation = function(){
                do_stop = true }

            var resp = true;
            for(var i in _handlers){
                if(_handlers[i] && _handlers[i][event_name])
                    resp = _handlers[i][event_name].apply(null, arguments);
                if(resp != undefined && !resp)
					return false; // handled
                if(do_stop)
                    break
            }
        });
    };

	o.on = function(element, event_name, data, drag_opts){
        // Nasty Hack:
        // this assumes mousedown is handled elsewhere, and canceled
        // which allows for separate mousedown and dragstart handlers
        // also passes awkward opts parameter to drag handlers
        if(event_name.indexOf('drag') == 0)
            $(element).drag(event_name, event_bubbler(event_name, data),
                $.extend({bubble_mousedown: true}, drag_opts))
		else
            $(element).on(event_name, event_bubbler(event_name, data));
		return o;
	};

    (function(o){
        // long hold event binding

        var timer, fired
        o.long_hold = function(element, data){
            var bubble_hold = event_bubbler('long_hold', data),
                bubble_release = event_bubbler('long_hold_cancel', data);

            var cancel = function(ev, fire_release){
                if(timer){
                    clearTimeout(timer);
                    timer = undefined;
                    if(fire_release)
                        bubble_release(ev);
                }
                fired = false;
            };

            element
                .on('mousedown', function(ev){
                    function long_hold(){
                        fired = true;
                        bubble_hold(ev);
                    }
                    timer = setTimeout(long_hold, 500);
                })
                .on('mouseup', function(ev){
                    cancel(ev, fired);
                })
                .on('mousemove', function(ev){
                    cancel(ev, false);
                });

            return o;
        };
    })(o);

	return o;
});
