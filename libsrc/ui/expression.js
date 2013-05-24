define(['browser/layout',
        'browser/jquery',
        'server/context',
        'ui/util'], function(layout, $, context, util) {
    if (typeof Hive == "undefined") Hive = {};

    Hive.Page = (function(){
        var o = {};
        o.initialized = false;

        o.send_top = function(msg){
            window.parent.postMessage(msg, '*');
        };
        
        o.paging_sent = false;
        o.page = function(direction){
            if(o.paging_sent) return;
            o.paging_sent = true;
            o.send_top(direction);
        };
        o.page_next = function(){ o.page('next') },
        o.page_prev = function(){ o.page('prev') };

        o.layout_parent = function(){
            o.send_top('layout=' + $(window).width() + ',' + $(window).height());
        };

        o.init = function(){
            window.addEventListener('message', function(m){
                if ( m.data.action == "show" ) {
                    function callback(data){
                        $('body').html(data);
                        setTimeout(o.show, 0);
                    };
                    if (m.data.password && !$('body').children().length){
                        $.post('', { password: m.data.password, partial: true }, callback);
                    } else {
                        o.show();
                    }
                }
                if ( m.data.action == "hide" ) o.hide();
            }, false);

            // If SNAPSHOT_PARAM is tacked onto the end of the URL, go into "snapshot mode,"
            // which basically means replace youtube and vimeo iframes with static images of the
            // same size.
            var SNAPSHOT_PARAM = '?snapshot';
            var currentURL = window.location.toString();
            if (currentURL.indexOf(SNAPSHOT_PARAM, currentURL.length - SNAPSHOT_PARAM.length) !== -1) {
                Hive.Page.snapshot_mode();
            }
            $(window).resize(o.layout_parent)
                 .click(function(){ o.send_top('focus'); });
        };
        
        o.snapshot_mode = function() {
            function getURLDomain(url) {
                var temp = document.createElement('a');
                temp.href = url;
                return temp.host;
            }
            // Look for Vimeo embed iframes
            $('.hive_html iframe').map(function(idx, el) {
                if (getURLDomain(el.src) != 'player.vimeo.com') return;
                var videoMatch = el.src.match(/player\.vimeo\.com\/video\/([0-9]+)/);
                if (videoMatch.length == 1) {
                    console.log("Can't replace vimeo video at ", el.src, " with snapshot placeholder image!");
                    return;
                }
                var videoID = videoMatch[1];
                var vimeoAPIURL = 'http://vimeo.com/api/v2/video/' + videoID + '.json?callback=?';
                $.getJSON(vimeoAPIURL, {format: "json"}, function(data) {
                    if (data[0]['thumbnail_large'] !== undefined) {
                        // Substitute image for video
                        $(el).parent().html('<img src="' + data[0]['thumbnail_large'] + '"/>');
                    }
                });
            });
            // Look for youtube embeds
            $('.hive_html object param[name=movie]').map(function(idx, el) {
                var videoURL = el.value;
                if (getURLDomain(videoURL) !== 'www.youtube.com') return;
                var videoMatch = videoURL.match(/youtube\.com\/v\/([a-zA-Z\-0-9]+)[\?\/$]/);
                // Find containing .hive_html element, substitute image for video.
                // Youtube's 0.jpg is the full-size image preview.
                $(el).closest('.hive_html').html('<img src="http://img.youtube.com/vi/' + videoMatch[1] + '/0.jpg"/>') 
            });
        }

        o.init_content = function(){
            // bonus paging and scrolling features
            // TODO: prevent scroll sticking after mouse-up outside of expr frame
            // TODO: figure out how to attach to all elements that don't have default drag behavior
            // TODO: make work in FF
            var scroll_ref, mouse_ref;
            $('#bg').on('dragstart', function(e, dd){
                scroll_ref = [document.body.scrollLeft, document.body.scrollTop];
                mouse_ref = [e.clientX, e.clientY];
            }).on('drag', function(e, dd){
                document.body.scrollLeft = scroll_ref[0] - e.clientX + mouse_ref[0];
                document.body.scrollTop = scroll_ref[1] - e.clientY + mouse_ref[1];
            });

            //$(document.body).on('keydown', function(e){
            //    if(e.keyCode == 32) // space
            //        if(document.body.scrollTop + $(window).height() == document.body.scrollHeight) o.page_next();
            //    if(e.keyCode == 39) // right arrow
            //        if(document.body.scrollLeft + $(window).width() == document.body.scrollWidth) o.page_next();
            //    if(e.keyCode == 37)
            //        if(document.body.scrollLeft == 0) o.page_prev();
            //});

            o.init_jplayer();
        };

        o.show = function(){
            o.paging_sent = false;
            if(!Hive.expr) return;

            if( ! o.initialized ){
                o.initialized = true;
                // o.init_content();
            }

            // $.each(Hive.expr.apps, function(i, app){
            //     if (app.type == "hive.html") {
            //         var element = $('#app' + (app.id || app.z));
            //         if (!element.html()){
            //             element.html(app.content);
            //         }
            //     }
            // });
            
            $('.hive_html').each(function(i, div) {
                var $div = $(div);
                if ($div.html() != '') return;
                $div.html($div.attr('data-content'));
            });
            
            layout.place_apps();

            util.update_targets();
            o.layout_parent();
        };
        o.hide = function(){
            $('.hive_html').each(function(i, div) {
                var $div = $(div);
                $div.attr('data-content',$div.html());
                $div.html('');
            });
        };

        return o;
    })();
    
    return {
        'initExpression': function() {
            $(Hive.Page.init);
            Hive.Page.show();
            // layout.place_apps();
        }
    };
});