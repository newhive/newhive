define([
    'sj!templates/manage_tags.html'
], function(
    manage_tags_template
){
    var o = {};

    // TODO-refactor: move the tags functionality out of profile
    o.render = function(){
        $('#site').empty().append(manage_tags_template());
    };

    return o;
});