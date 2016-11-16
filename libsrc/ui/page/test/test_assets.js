// http://duke:3737/home/admin/test_assets

define([
    'context'
    ,'ui/util'
], function(context, util){
    var o = {}
    
    o.render = function(){
        $("body,html").css("background-color", "rgb(84, 113, 175)")

        var $icons = $('<div class="test_icons">').prependTo("body")
        var assets = util.all_assets(), assets_by_dir = {}, dirs_sorted = []
        for (var asset_name in assets) {
            var prefix = asset_name.slice(0, asset_name.lastIndexOf('/') + 1)
            if (!assets_by_dir[prefix]) {
                dirs_sorted.push(prefix)
                assets_by_dir[prefix] = []
            }
            assets_by_dir[prefix].push(asset_name)
        }
        dirs_sorted.sort()
        for (var i = 0; i < dirs_sorted.length; ++i) {
            prefix = dirs_sorted[i]
            $('<h1>' + prefix + '</h1>').appendTo($icons)
            var assets_sorted = assets_by_dir[prefix]
            assets_sorted.sort()
            for (var j = 0; j < assets_sorted.length; ++j) {
                var asset_name = assets_sorted[j]
                    ,asset = assets[asset_name]
                if ([".gif", ".png"].indexOf(asset_name.slice(-4)) > 0) {
                    $('<img src="' + asset + '" title="' + asset_name + '">').appendTo($icons)
                }
            }
        }

        // var filter = context.query.t || ".dialog"
        // $("body").empty().append(all_divs.find(filter).css({
        //     margin: '15px'
        //     , display: 'inline-block'
        //     , position: 'static'
        //     // HOLY CODE SMELL!  YUI compressor barfs on keyword "float"
        //     , "float": 'left'
        // }).showshow())
        // .add("html").css("background-color", "rgb(84, 113, 175)")

        // $('.dialog .defer').each(function(i, el){
        //     $(el).parent().data('dialog').undefer()
        // })
    };

    return o;
});

