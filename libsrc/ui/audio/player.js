define([
    'jquery'
    ,'sj!templates/audio_player.html',
], function(
    $
    ,template
){
 
return function(container, url){
    var o = {}, $ui = template({url: url}).appendTo($(container)),
        audio = $ui.find('audio')[0]

    o.fade = function(volume_level, over_milliseconds){
        $(audio).animate({volume: volume_level}, over_milliseconds)
    }
    o.src = function(url){ audio.src = url }
    o.seek = function(t){ audio.currentTime = t }
    o.play = function(){ audio.play() }
    o.pause = function(){ audio.play() }
    o.layout = function(){
        var h = $ui.height()
        $ui.find('.play-pause').width(h)
        $ui.find('.seek').width($ui.width() - h)
        var $vol = $ui.find('.volume').width(h)
        $vol.find('*').width(h/2)
        $ui.find('.buttons *').height(h/2).css('font-size', h/2)
    }

    $(audio).on('play', function(){
        $ui.find('.play').hide()
        $ui.find('.pause').show()
    }).on('pause', function(){
        $ui.find('.play').show()
        $ui.find('.pause').hide()
    }).on('timeupdate', function(){
    }).on('load', function(){
        console.log('loaded?', audio.duration)
    })

    o.layout()

    return o
}

})