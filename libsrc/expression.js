$(function() {
    // Warning for IE
    //if(/MSIE/.test(navigator.userAgent)){
    if(/MSIE/.test(navigator.userAgent)){
        var count = parseInt(readCookie('ie_warning_count'));
        if (! count) { count=0; }
        if ( count < 2) {
            showDialog('#ie_warning');
            count++;
            createCookie('ie_warning_count', count, 7);
        }
    }
});
