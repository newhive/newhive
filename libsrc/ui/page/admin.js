define([
    'context'
    ,'sj!templates/site_flags.html'
], function(
    context
    ,site_flags_template
){
    var o = {};

    o.render = function(){
        $('#site').empty().append(site_flags_template());
        var $insert_point = $('.site_flags')
            , _flags = JSON.parse(context.page_data.site_flags)
            , flags = []
        for (var flag in _flags) {
            flags.push(flag)
        }
        flags.sort()
        for (var i in flags) {
            console.log(flags[i])
            var flag = flags[i]
                ,content = _flags[flag]
                ,value = content
                ,description = content.description
                ,path = flag.split("/")
            if (typeof(description) == "string") {
                value = content.values
            }
            if (value) {
                $("<label title='" + description + "''>" + flag.replace(/.*[/]/,'')
                    + ": <input name=" + flag
                    + " value=" + value + "></label>")
                .appendTo($insert_point)
            }
            else {
                var headers = ['h2','h3','h4','h5']
                    ,header = headers[path.length - 1] || 'h6'
                $("<" + header + ">" + flag.replace(/.*[/]/,'') + ": " + description + "</" + header + ">")
                    .appendTo($insert_point)
            }
            $insert_point.children().last().css("padding-left", (path.length - 1) * 50)
            if (value)
                $("<br>").appendTo($insert_point)
        }
    };

    return o;
});
