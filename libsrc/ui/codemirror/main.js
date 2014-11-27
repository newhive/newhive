// TODO: figure out how to include this after codemirror for debug=True
define([
     './lib/codemirror'
    ,'./addon/edit/matchbrackets.js'
    ,'./addon/comment/continuecomment.js'
    ,'./addon/comment/comment.js'
    ,'./mode/javascript/javascript.js'
    ,'./mode/css/css.js'
], function(cm){
    return cm
});
