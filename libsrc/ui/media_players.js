define([
    'jquery'
], function(
    $
){
    var players = {}

    // constructor takes hive_app element and returns player object if
    // recognized, false otherwise
    players.jplayer = function(el){
        var o = {}, $jplayer = $(el).find('.jp-jplayer')
        if(!$jplayer.length) return false

        // based on http://jplayer.org/latest/developer-guide/ 
        o.play = function(pos){
            $jplayer.jPlayer('play', pos)
        }
        o.pause = function(){
            $jplayer.jPlayer('pause')
            var status = $jplayer.data("jPlayer").status
            if(status.currentTime) return status.currentTime
        }
        o.ready = function(fn){
            $jplayer.bind_once_anon($.jPlayer.event.ready + '.hive', fn)
        }
        o.finish = function(fn){
            $jplayer.bind_once_anon($.jPlayer.event.ended + '.hive', fn)
        }
        o.play_change = function(fn){
            $jplayer.bind_once_anon($.jPlayer.event.play + '.hive',
                function(){ fn(true) })
            $jplayer.bind_once_anon($.jPlayer.event.pause + '.hive',
                function(){ fn(false) })
        }

        return o
    }

    // TODO-playlists: add youtube, vimeo, and soundcloud support
    // see content_extension/media_play.js for postMessage API examples

    return players
});
