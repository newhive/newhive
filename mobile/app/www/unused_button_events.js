// TODO: implement multitouch?
function button(sel, click){
    var jq = $(sel), hover_el, hovering = false
    $(jq).on('touchstart', function(){
        var hover_el = this, hover_jq = $(hover_el)
        hovering = true
        hover_jq.addClass('hover').on('touchmove', function(ev){
            var tch = ev.originalEvent.touches[0],
                x = tch.clientX, y = tch.clientY,
                over = document.elementFromPoint(x, y)
            if(over == hover_el || $.contains(hover_el, over)){
                if(!hovering){
                    hover_jq.addClass('hover')
                    hovering = true
                }
            }else{
                hover_jq.removeClass('hover')
                hovering = false
            }
            // android needs this, otherwise next touchmove isn't fired
            ev.preventDefault()
        })
    }).on('touchend', function(){
        if(hovering) click()
    })
}

