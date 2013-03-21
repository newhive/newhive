function createCookie(name,value,expiry) {
    var date;
    if (expiry) {
        if (typeof(days) == "number"){
            date = new Date();
            date.setTime(date.getTime()+(expiry*24*60*60*1000));
        } else {
            date = expiry;
        }
        var expires = "; expires="+date.toGMTString();
    }
    else var expires = "";
    var cookie = name + "=" + escape(value) + expires + "; path=/; domain=" + server_url.split('/')[2] + ";";
    document.cookie = cookie;
}

function readCookie(name) {
    var pairs = document.cookie.split(';');
    for(var i=0; i < pairs.length; i++) {
        pair = pairs[i].trim().split('=');
        if(pair[0] == name && pair.length > 1) return unescape(pair[1]);
    }
    return null;
}

function eraseCookie(name) {
    createCookie(name,"",-1);
}
