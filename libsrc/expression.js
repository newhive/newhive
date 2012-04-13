$(function() {
    $(window).resize(place_apps);
    place_apps();

    // hive.audio jplayer setup
    if ($('.app_hive_audio').length > 0) {
        $('head').append("<link rel='stylesheet' type='text/css' href='/lib/libsrc/jplayer/jplayer.blue.monday.css'>");
    };

    $('.app_hive_audio .jp-jplayer').each(function(){
        $(this).jPlayer({
            cssSelectorAncestor: "#jp_container_" + $(this).data("index"),
            ready: function () {
              $(this).jPlayer("setMedia", {
                mp3: $(this).data("url")
              });
            },
            swfPath: server_url + "lib/",
            supplied: "mp3"
        });
    });
    
    // Warning for IE
    //if(/MSIE/.test(navigator.userAgent)){
    if(/MSIE/.test(navigator.userAgent)){
        var count = parseInt(readCookie('ie_warning_count'));
        if (! count) { count=0; }
        if ( count < 1) {
            showDialog('#ie_warning');
            count++;
            createCookie('ie_warning_count', count, 30);
        }
    }
});
$(window).load(function(){setTimeout(place_apps, 10)}); // position background
