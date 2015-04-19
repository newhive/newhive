"use strict";
define([
    'browser/jquery'
    ,'ui/util'
    ], function($, util){

    var o = {}

    var common_exports = function() {
        curl.expose("ui/menu", "menu")
        curl.expose("ui/util", "util")
        curl.expose("browser/js", "js")
    }
    common_exports()

    o.edit_menu = function() {

    }

    ///////////////////////////////
    // Editor
    o.sel = function(n) {
        // Maybe should return group / groups
        if (n == undefined)
            n = 0
        return h.env.Selection.elements(n)
    }

    return o
})
