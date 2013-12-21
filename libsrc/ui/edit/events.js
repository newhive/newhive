define([
    'browser/jquery'
], function(
    $
){
    // Event handling with custom bubbling: dispatches events to specified
    // list of handlers (_handlers) in order.
    // All handlers must have an integer handler_type property,
    // which specifies bubble order
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
    	var handlers = _handlers.slice(), handler_type = 0;
    	if(handler){
    		handler_type = handler.handler_type;
    		handlers[handler_type] = handler;
    	}

        return function(){
            var resp = true, handlers = _handlers;
            for(var i = handler_type; i < handlers.length; i++){
                if(handlers[i] && handlers[i][event_name])
                    resp = handlers[i][event_name].apply(null, arguments);
                if(resp != undefined && !resp)
					return false; // handled
            }
        };
    };

	o.on = function(element, event_name, handler, handler_type){
		$(element).on(event_name,
			event_bubbler(event_name, handler, handler_type));
	};

	return o;
});
