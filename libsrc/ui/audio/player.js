define([
    'browser/jquery'
    ,'sj!templates/audio_player.html',
], function(
    $
    ,template
){
 
return function(url){
    template({url: url})
}

})