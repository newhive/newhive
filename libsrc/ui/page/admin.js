define([
    'sj!templates/site_flags.html'
], function(
    site_tags_template
){
    var o = {};

    o.render = function(){
        $('#site').empty().append(site_tags_template());
    };

    return o;
});
