define([
    'sj!templates/manage_tags.html'
], function(
    manage_tags_template
){
    var o = {};

    o.render = function(){
        $('#site').empty().append(manage_tags_template());
    };

    return o;
});