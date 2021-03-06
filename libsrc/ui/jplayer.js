// jPlayer shenanigans
define([
    'jquery',
    'ui/util',
    'jquery/jplayer/skin.js'
], function($, util, skin){

init_jplayer = function(){
    var update_timer = function (player) {
        return function(event) {
            var status = event.jPlayer.status;
            $(player).siblings().find('.jp-remaining-time')
                .text($.jPlayer.convertTime(status.duration - status.currentTime));
        }
    };

    $('.jp-jplayer').each(function(){
        $(this).jPlayer({
            cssSelectorAncestor: "#jp_container_" + $(this).data("index"),
            ready: function (event) {
              $(this).jPlayer("setMedia", {
                  mp3: $(this).data("url").replace(/^https?:/, window.location.protocol).replace(/:\d+/, '')
              });//.bind($.jPlayer.event.timeupdate, update_timer(this));
              //update_timer(this)(event);
            },
            loadeddata: update_timer(this),
            timeupdate: update_timer(this),
            ended: update_timer(this),
            swfPath: util.asset('Jplayer.swf'),
            supplied: "mp3",
            verticalVolume: true
        });

        // Serious hackery below
        // TODO: FIX THIS. This used to hook into ui/layout.place_apps
        // positionHacks.add(
        //     function(that){
        //         return function(){
        //             var height = $(that).siblings().find('.jp-interface').height();
        //             $(that).siblings().find('.jp-button').width(height).height(height);
        //         };
        //     }(this)
        // );
    });
    $('.jp-interface').hover(
        function(e){ 
            var seekBar = $(this).find('.jp-seek-wrapper');
            seekBar.width(seekBar.width() - seekBar.height());
            $(this).find('.jp-volume').show();
            $(this).find('.jp-remaining-time').hide();
        }, 
        function(e){ 
            $(this).find('.jp-seek-wrapper').width("100%");
            $(this).find('.jp-volume').hide();
            $(this).find('.jp-remaining-time').show();
        }
    );
    //var returnFalse = function(){ return false; };
    //$('.jp-volume-buttons .button').click(returnFalse).select(returnFalse).mousemove(returnFalse);
    $('.jp-volume-plus').click(function(){
        var player = $(this).parents('.jp-audio').siblings('.jp-jplayer');
        var currentVolume = player.jPlayer('option', 'volume');
        var newVolume;
        if (currentVolume > 0.8) { newVolume = 1 }
        else if (isFinite(currentVolume)) { newVolume = currentVolume + 0.2 }
        else { newVolume = 0.2 }
        player.jPlayer('volume', newVolume);
    });
    $('.jp-volume-minus').click(function(){
        var player = $(this).parents('.jp-audio').siblings('.jp-jplayer');
        var currentVolume = player.jPlayer('option', 'volume');
        var newVolume;
        if (currentVolume < 0.2) { newVolume = 0 }
        else if (isFinite(currentVolume)) { newVolume = currentVolume - 0.2 }
        else { newVolume = 0.8 }
        player.jPlayer('volume', newVolume);
    });
};
return {
    init_jplayer: init_jplayer
};
});
