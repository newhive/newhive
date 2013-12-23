define([
    'browser/jquery'
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

    // Create an event handler that dispatches to the current (focused)
    // _handlers in order, optionally starting at the given handler first and
    // bubbling to the handlers in _handlers after handler.handler_type.
    // Bubbling halts when a handler returns a defined falsey value
    var event_bubbler = function(event_name, handler){
    	var handlers = _handlers;
        return (function(ev){
            ev.target_object = handler;

            // patch native event with hacked stopPropagation that encompasses
            // our custom bubbling. Consider renaming to "stopCustomPropagation"
            // TODO-minor-bugbug: add corresponding hack for ev.preventDefault
            var _stopPropagation = ev.stopPropagation, do_stop = false;
            ev.stopPropagation = function(){
                do_stop = true;
                _stopPropagation();
            };

            var resp = true;
            for(var i in handlers){
                if(handlers[i] && handlers[i][event_name])
                    resp = handlers[i][event_name].apply(null, arguments);
                if(resp != undefined && !resp)
					return false; // handled
                if(do_stop) break;
            }
        });
    };

	o.on = function(element, event_name, handler){
		$(element).on(event_name, event_bubbler(event_name, handler));
		return o;
	};

	return o;
});
