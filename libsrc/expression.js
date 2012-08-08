if (typeof Hive == "undefined") Hive = {};

Hive.Page = (function(){
    var o = {};
    o.initialized = false;

    o.send_top = function(msg){ top.postMessage(msg, Hive.parent_url); },
        
    o.paging_sent = false;
    o.page = function(direction){
        if(o.paging_sent) return;
        o.paging_sent = true;
        o.send_top(direction);
    },
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

        $(window).resize(o.layout_parent)
             .click(function(){ o.send_top('focus'); });
    };

    o.init_content = function(){
        // TODO: ends up being annoying a lot of times
        $('#bg').on('click', function(e){
            if(e.clientX > $(window).width() * .8) o.page_next();
            if(e.clientX < $(window).width() * .2) o.page_prev();
        });

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

        $(document.body).on('keydown', function(e){
            if(e.keyCode == 32) // space
                if(document.body.scrollTop + $(window).height() == document.body.scrollHeight) o.page_next();
            if(e.keyCode == 39) // right arrow
                if(document.body.scrollLeft + $(window).width() == document.body.scrollWidth) o.page_next();
            if(e.keyCode == 37)
                if(document.body.scrollLeft == 0) o.page_prev();
        });

        o.init_jplayer();
    };

    // jPlayer shenanigans
    o.init_jplayer = function(){
        var update_timer = function (player) {
            return function(event) {
                var status = event.jPlayer.status;
                $(player).siblings().find('.jp-remaining-time')
                    .text($.jPlayer.convertTime(status.duration - status.currentTime));
            }
        };

        $('.jp-jplayer').each(function(){
            $(this).jPlayer({
                cssSelectorAncestor: "#jp_container_" + $(this).data("index"),
                ready: function (event) {
                  $(this).jPlayer("setMedia", {
                      mp3: $(this).data("url").replace(/^https?:/, window.location.protocol).replace(/:\d+/, '')
                  });//.bind($.jPlayer.event.timeupdate, update_timer(this));
                  //update_timer(this)(event);
                },
                loadeddata: update_timer(this),
                timeupdate: update_timer(this),
                ended: update_timer(this),
                swfPath: asset('Jplayer.swf'),
                supplied: "mp3",
                verticalVolume: true
            });
            // Serious hackery below
            positionHacks.add(
                function(that){
                    return function(){
                        var height = $(that).siblings().find('.jp-interface').height();
                        $(that).siblings().find('.jp-button').width(height).height(height);
                    };
                }(this)
            );
        });
        $('.jp-interface').hover(
            function(e){ 
                var seekBar = $(this).find('.jp-seek-wrapper');
                seekBar.width(seekBar.width() - seekBar.height());
                $(this).find('.jp-volume').show();
                $(this).find('.jp-remaining-time').hide();
            }, 
            function(e){ 
                $(this).find('.jp-seek-wrapper').width("100%");
                $(this).find('.jp-volume').hide();
                $(this).find('.jp-remaining-time').show();
            }
        );
        //var returnFalse = function(){ return false; };
        //$('.jp-volume-buttons .button').click(returnFalse).select(returnFalse).mousemove(returnFalse);
        $('.jp-volume-plus').click(function(){
            var player = $(this).parents('.jp-audio').siblings('.jp-jplayer');
            var currentVolume = player.jPlayer('option', 'volume');
            var newVolume;
            if (currentVolume > 0.8) { newVolume = 1 }
            else if (isFinite(currentVolume)) { newVolume = currentVolume + 0.2 }
            else { newVolume = 0.2 }
            player.jPlayer('volume', newVolume);
        });
        $('.jp-volume-minus').click(function(){
            var player = $(this).parents('.jp-audio').siblings('.jp-jplayer');
            var currentVolume = player.jPlayer('option', 'volume');
            var newVolume;
            if (currentVolume < 0.2) { newVolume = 0 }
            else if (isFinite(currentVolume)) { newVolume = currentVolume - 0.2 }
            else { newVolume = 0.8 }
            player.jPlayer('volume', newVolume);
        });
    };

    o.show = function(){
        o.paging_sent = false;
        if(!Hive.expr) return;

        if( ! o.initialized ){
            o.initialized = true;
            o.init_content();
        }

        place_apps();

        $.each(Hive.expr.apps, function(i, app){
            if (app.type == "hive.html") {
                var element = $('#app' + (app.id || app.z));
                if (!element.html()){
                    element.html(app.content);
                }
            }
        });

        o.layout_parent();
    };

    o.hide = function(){
        $('.happ.hive_html').html('');
    };

    return o;
})();

$(Hive.Page.init);
