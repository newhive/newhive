define([
    'browser/jquery'
], function($){
    var o = {}, 

    // app manipulation
    // youtube frame
    //    '{"event":"listening","id":1}' // request events
    //        '{"event":"infoDelivery","info":{"playerState":2,"c…f_Rs","playlist":null,"playlistIndex":-1},"id":1}' // paused
    //        '{"event":"infoDelivery","info":{"playerState":0,"c…f_Rs","playlist":null,"playlistIndex":-1},"id":1}' // ended
    //        playerState
    //            (-1), ended (0), playing (1), paused (2), buffering (3), video cued (5).
    //    '{"event":"command","func":"playVideo","args":[],"id":1}' // play
    // soundcloud frame
    //     '{"widgetId":"widget_1397872543107","method":"ready","value":null}'
    //     '{"method":"addEventListener","value":"finish"}'
    //         '{"widgetId":"widget_1397787298277","method":"finish","value":{"loadedProgress":1,"currentPosition":276400,"relativePosition":1}}'
    //     '{"method":"play"}', '*')

    o.show = function(app){
        $('.hive_html,.hive_audio').map(function(el){
        })
        if(!app.is('.hive_html')) return
    }

    o.hide = function(app){
        if(!app.is('.hive_html')) return
    }

    o.content_apply = function(el){
    }

    return o
});
