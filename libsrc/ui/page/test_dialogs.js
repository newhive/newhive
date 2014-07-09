define([
    "test/html_global"
], function(
    test_dialogs
){
    var o = {};

    o.render = function(){
        test_dialogs.render()
    };

    return o;
});
