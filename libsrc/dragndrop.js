/*******************************************************************************************/	
// Super simple drag and drop
// Abram Clark
$.fn.extend({
    draggable : function() { return this.each(function() {
        var ghost;
        $(this).drag('start', function (e) {
            ghost = $(this).clone();
            ghost.pos = $(this).offset();
            ghost.css({position :'absolute', top : ghost.pos.top, left : ghost.pos.left, cursor : 'default', opacity : .7, 'z-index' : 10000 });
            $('body').append(ghost);
        });
        $(this).drag(function (e, dd) {
            ghost.css({ left : ghost.pos.left + dd.deltaX, top : ghost.pos.top + dd.deltaY })
        });
        var that = this;
        $(this).drag('end', function (e, dd) {
            ghost.remove();
            $('.droppable').each(function() {
                var opts = $(this).data('drop');
                if(e.pageX > $(this).offset().left && e.pageX < $(this).offset().left + $(this).width() &&
                   e.pageY > $(this).offset().top  && e.pageY < $(this).offset().top  + $(this).height())
                    if($(that).is(opts.accept)) opts.drop(this, that);
            });
        });
        return this;
    }) }
    , droppable : function(opts) { return this.each(function() {
        $(this).addClass('droppable');
        $(this).data('drop', opts);
        return this;
    }) }
});
