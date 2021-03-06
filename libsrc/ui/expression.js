/* Expression
  Defines the behavior of the expression frame.
  Expression interacts with its parent frame, the main site,
    via postMessage.
*/
define([
    'jquery'
    ,'browser/js'
    ,'context'
    ,'browser/layout'
    ,'ui/jplayer'
    ,'ui/util'
    ,'ui/media_players'
    ,'analytics'

    ,'jquery/jplayer/skin'
    ,'jquery/rotate.js'
], function(
    $
    ,js
    ,context
    ,layout
    ,jplayer
    ,util
    ,media_players
    ,analytics
){
    var o = {}
        ,no_embed = false
    o.initialized = false;

    var top_queue = [], top_ready = false
    o.send_top = function(msg){
        if(!top_ready) top_queue.push(msg)
        window.parent.postMessage(msg, '*')
    }
    o.expr_receive = function(ev){
        if(!top_ready){
            top_ready = true
            top_queue.map(function(m){ window.parent.postMessage(m, '*') })
        }
        var msg = ev.data
        if( msg.action == 'show' ){
            function callback(data){
                $('body').html(data);
                setTimeout(o.show, 0);
            };
            if (msg.password && !$('body').children().length){
                $.post('', { password: msg.password, partial: true }, callback);
            } else {
                o.show();
            }
        } 
        else if( msg.action == 'hide' ) o.hide()
        else if( msg.action == 'play_toggle' ) o.player_toggle()
        else if( msg.action == 'page_down' )
            document.body.scrollTop += $(window).height()
    }

    // o.paging_sent = false;
    // o.page = function(direction){
    //     if(o.paging_sent) return;
    //     o.paging_sent = true;
    //     o.send_top(direction);
    // };
    o.page_next = function(){ o.send_top('next') },
    o.page_prev = function(){ o.send_top('prev') };

    // o.layout_parent = function(){
    //     o.send_top('layout=' + $(window).width() + ',' + $(window).height());
    // };

    var layout_coord = 0
    o.layout = function(){
        layout.place_apps(layout_coord, o.expr) 
    }

    o.init = function(expr){
        o.expr = expr
        layout_coord = expr.layout_coord || 0
        client_data = expr['apps']
        $.each(client_data, function(app_id, data){
            var $app = $('#' + app_id)
            $app.data(data) 
            if (data.autoplay)
                $app.addClass("autoplay")
            // Doing this server-side
            // if (data.autohide) {
            //     // $app.css({opacity: "0", "pointer-events":"none"})
            //     // or try this:
            //     $app.css({visibility: "hidden"})
            //     // can't merely hide the app, or it won't autoplay
            //     // $app.css({display:"none"})
            // }
        })

        o.add_player_type(media_players.jplayer)

        context.parse_query();
        no_embed = ("no-embed" in context.query);
        if (no_embed) 
            o.hide();
        else
            o.show();

        window.addEventListener('message', o.expr_receive)
        $(window).click(function(){ o.send_top('focus') })

        if (!util.mobile()) {
            var zoom = layout.get_zoom()
            $(window).resize(function(){
                var new_zoom = layout.get_zoom()
                if(new_zoom == zoom) o.layout()
                zoom = new_zoom
            })
        }
        js.on_ready(function() {
            return
            $("*[data-scaled]").map(function(i, app) {
                var $app = $(app)
                    ,$img = $app.find("img")
                    ,$img2 = $img.clone()
                    ,$container = $img.parent()
                $img = $img.addClass("loaded").add($img2)
                $("<div class='lazy_load noclip'>").appendTo($container)
                    .append($img)
                $img2.lazy_load($app.data("scaled")).on("lazy_load",
                    function(ev, el) {
                        $(el).siblings().css({opacity: 0})
                    })
                $app.removeAttr("data-scaled")
            })
        })
        //if (0 && util.mobile()) {
        //    $.event.special.swipe.horizontalDistanceThreshold = 200;
        //    $(document).on("swipe", function(ev) {
        //        if (ev.swipestart.coords[0] > ev.swipestop.coords[0])
        //            o.page_next()
        //        else
        //            o.page_prev()
        //    })
        //}

        if(util.mobile()) o.init_mobile()

        // if on custom domain, there's no parent frame to track analytics
        if(window.location.host != context.config.content_domain){
            analytics.setup()
            analytics.track_pageview()
        }
    }

    var ideal_aspect = 16./9
    var landscape = false
    function do_orient() {
        $("meta[name=viewport]").prop("content",
            "width=" + 500 * (landscape ? ideal_aspect : 1))
        // console.log("orient " + landscape)
        o.layout()
    }

    o.init_mobile = function(){
        // From: http://fettblog.eu/blog/2012/04/16/robust-but-hacky-way-of-portraitlandscape-detection/
        var mql = window.matchMedia("(orientation: portrait)");

        // Add a media query change listener
        mql.addListener(function(m) {
            var new_landscape = !(m.matches)
            if (new_landscape == landscape)
                return
            landscape = new_landscape
            setTimeout(do_orient, 1)
        });

        // $(document).ready(function () {
            // var on_orientation = function(ev) {
            //     console.log("orient " + orientation + " " + ev)
            //     var new_landscape = (orientation % 180) != 0
            //     if (new_landscape == landscape)
            //         return
            //     // var landscape = win.width() > win.height()
            //     $("meta[name=viewport]").prop("content",
            //         "width=" + 500 * (landscape ? ideal_aspect : 1))
            //     console.log("orient " + landscape)
            //     o.layout()
            // }
            // window.ondeviceorientation = on_orientation
            // window.onorientationchange = on_orientation
            // $(window).bind('orientationchange', on_orientation)
        // })

        // TODO-cleanup: make into fake swipe event
        // TODO-polish: ignore events with multiple touches (conflicts with zoom)
        // Swipe to prev and next for mobile web
        var touch_start = false, swiping = false, swipe_x = 0, swipe_max = 75
            , swipe_container_el, swipe_el, swipe_dir
        var swipe_start = function(x){
            swiping = true
            swipe_dir = x > 0 ? 1 : -1
            swipe_container_el = $("<div class='swipe_feedback'>"
                + "<div class='icon'></div></div>").appendTo('body')
                .addClass(x < 0 ? 'right' : 'left')
            swipe_el = swipe_container_el.find('.icon')
        }, swipe = function(x){
            if(swipe_dir == 1)
                swipe_x = js.bound(x, 0, swipe_max)
            else
                swipe_x = js.bound(x, -swipe_max, 0)
            if(swipe_x < 0) swipe_el.css('left', 140 + swipe_x)
            else swipe_el.css('right', 140 - swipe_x)
            swipe_el.toggleClass('on', Math.abs(swipe_x) == swipe_max)
        }, swipe_end = function(){
            swiping = touch_start = false
            swipe_container_el.remove()

            if(Math.abs(swipe_x) < swipe_max) return
            if(swipe_x < 0)
                o.page_next()
            else
                o.page_prev()
        }
        // $(document).on('touchstart', function(ev){
        //     var touches = ev.originalEvent.touches
        //     if(touches && touches.length)
        //         touch_start = [touches[0].clientX, touches[0].clientY]
        // }).on('touchmove', function(ev){
        //     if(!touch_start) return

        //     var touches = ev.originalEvent.touches, touch_now
        //     if(touches && touches.length)
        //         touch_now = [touches[0].clientX, touches[0].clientY]

        //     var delta = [touch_now[0] - touch_start[0], touch_now[1] - touch_start[1]]
        //     if(swiping) swipe(delta[0])

        //     // differentiate between scrolling and horizontal swiping
        //     // by assuming scroll if there's scrolling left in that direction
        //     // and otherwise assuming scroll if delta-Y is greater than delta-X

        //     if( (delta[0] > 0 && docuscrollHeightment.body.scrollLeft > 0) // left scroll remains
        //         || (delta[0] < 0 && (document.body.scrollLeft // right scroll remains
        //             + document.body.clientWidth < document.body.scrollWidth)
        //         )
        //     ){
        //         return
        //     }
        //     var h_mag = Math.abs(delta[0])
        //     if(h_mag >= 10 && h_mag > Math.abs(delta[1])){
        //         ev.preventDefault()
        //         if(!swiping) swipe_start(delta[0])
        //     }
        // }).on('touchend touchcancel touchleave', function(ev){
        //     if(!ev.originalEvent.touches.length && swiping)
        //         swipe_end()
        // })
    }

    // player state. play_playing is the intent to play, so if hide() is called
    // while true, it remains that way
    var players = [], player_current = -1, player_playing = false,
        player_loop = false, player_constructors = [], player_pos = 0
    o.add_player_type = function(constructor){
        player_constructors.push(constructor) }
    o.get_player = function(el){
        for(var i = 0; i < player_constructors.length; i++){
            var player = player_constructors[i](el)
            if(player) return player
        }
        return false // not supported
    }

    // if true, don't update player_playing next player_update()
    var autoplay_no_update = false 
    var player_update = function(i, playing){
        if(autoplay_no_update){
            autoplay_no_update = false
            return
        }
        if(playing == player_playing) return
        player_current = i
        player_playing = playing
        o.send_top(playing ? 'play' : 'play_pause')
    }
    o.player_pause = function(freeze){
        var player = players[player_current]
        if(!player) return
        if(freeze) autoplay_no_update = true
        player_pos = player.pause()
    }
    o.player_play = function(resume){
        if(!players.length) return
        if(resume && !player_playing){
            o.send_top('play_pause')
            return
        }
        if(player_current == -1) player_current = 0
        var player = players[player_current]
        if(!player) return
        player.play(player_pos)
        player_update(player_current, true)
    }
    o.player_toggle = function(){
        if(player_playing) o.player_pause()
        else o.player_play()
    }
    o.player_next = function(){
        player_current++
        if (player_loop)
            player_current %= players.length
        else if (player_current >= players.length){
            player_current = -1
            player_playing = false
        }
        var player = players[player_current]
        if(!player) return
        player.play()
    }
    o.autoplay = function(){
        if(player_current == -1) player_current = 0
        // mobile browsers refuse to autoplay
        if(util.mobile()) player_update(player_current, false)
        else o.player_play()
    }

    o.init_content = function(){
        if (0) {
            // Scroll the page on drags

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
        }

        // bonus paging and scrolling features
        var $window = $(window), keys_down = {}, scrolling = false
        $(document).on('keydown', function(ev){
            if(ev.keyCode == 32) // space
                if($window.scrollTop() + $window.height()
                    >= document.body.scrollHeight) o.page_next()
            if(ev.keyCode == 39){ // right arrow
                if( $window.scrollLeft() + $window.width() <
                    document.body.scrollWidth
                ) scrolling = true
                else if(!scrolling) o.page_next()
            }
            if(ev.keyCode == 37){ // left arrow
                if($window.scrollLeft() > 0) scrolling = true
                else if(!scrolling) o.page_prev()
            }
        }).on('keyup', function(ev){
            if(ev.keyCode == 39 || ev.keyCode == 37)
                scrolling = false
        })

        $('a, form').each(function(i, e){ o.link_target(e) });

        // Init jplayer, and autoplay as needed
        jplayer.init_jplayer();
        // HACK to fix audio player layout
        $(".hive_audio").each(function (i, el) {
            $(el).attr("data-scale", $(el).height() / 36.1)
        })
        $(".hive_audio .jp-controls").add(".hive_audio .jp-controls *")
            .css({width:"",height:""})

        // get list of autoplaying apps, sorted top-to-bottom
        players = $.map( $(".happ.autoplay").sort(function(a,b) {
            return a.getBoundingClientRect().top - b.getBoundingClientRect().top 
        } ), o.get_player )
        $.each(players, function(i, player){
            player.finish(o.player_next)
            player.play_change(function(playing){
                player_update(i, playing) })
        })
        if(players[0])
            players[0].ready(function(){ o.autoplay() })

        if (util.mobile()) o.layout()
    };

    o.link_target = function(a){
        var $a = $(a);
        if ($a.attr('target')) return;
        // TODO: Match against internal links and use routing system

        var href = $a.attr('href') || $a.attr('xlink:href') || $a.attr('action'),
            local_match = new RegExp('^(https?:)?//[\\w-]*.?' +
                context.config.server_domain).test(href),
            absolute = /(^\w+:)|(^\/\/)/.test(href),
            internal = /^(#|javascript:)/.test(href)
        if (!href || internal) return

        if(absolute && !local_match) {
            $a.attr('target', '_blank')
        } else {
            $a.attr('target', '_top')
            // move domain relative link from content domain to site domain
            if(!absolute){
                var domain = context.config.server_url.replace(/\/$/, '')
                if(href.indexOf('/') == 0) href = domain + href
                // add page path directory to path relative links
                else href = ( domain + '/' + o.expr.path.replace(/[^\/]*$/, '')
                    + href )
                if($a.attr('xlink:href')) $a[0].setAttributeNS(
                    'http://www.w3.org/1999/xlink', 'href', href)
                else $a.attr('href', href)
            }
        }
    }

    // called from script element generated from
    // python newhive.controller.expr.html_for_app for each code app
    var code_srcs = [], code_modules = [], animate_go
    o.load_code = function(code_src, modules){
        code_srcs.push({src:code_src, modules: modules})
    }
    o.load_code_url = function(code_url){
        code_srcs.push({url:code_url})
    }

    o.run_code = function(code_module){
        code_modules.push(code_module)
    
        code_module.run && code_module.run({view:true})
        if(!code_module.animate) return
        animate_go = 1
        var animate_frame = function(){
            code_module.animate()
            // TODO-compat: if requestAnimationFrame not supported,
            // fallback to setTimeout
            if(animate_go) requestAnimationFrame(animate_frame)
        }
        animate_frame()
    }

    var visible = false
    o.show = function(){
        if(visible) return
        visible = true
    
        o.paging_sent = false;
        // if(!Hive.expr) return;

        if( ! o.initialized ){
            o.initialized = true;
            o.init_content();
        }

        $('.hive_html').each(function(i, div) {
            var $div = $(div);
            if ($div.html() != '') return;
            $div.html($div.attr('data-content'));
        });
 
        if (!util.mobile())
            o.layout()

        var module_paths = function(modules) {
            return ["'jquery'","'ui/expression'"]
            .concat($.map(modules, function(p) { 
                return "'" + (p.path_view || p.path) + "'"
            }))
            .join(",")
        }
        var module_names = function(modules) {
            return ['$', 'expr']
            .concat($.map(modules, function(p) { return p.name }))
            .join(",")
        }
        code_srcs.map(function(src){
            if (src.url) {
                var $script = $('<script>').html(
                    "curl(['" + src.url + "', 'ui/expression'], " + 
                        "function(self, expr){ expr.run_code(self) })"
                )
            } else {
                var $script = $('<script>').html(
                    "curl([" + module_paths(src.modules) + "],function("
                    + module_names(src.modules) + "){"
                    + "var self={};" + src.src + ";expr.run_code(self) })"
                )
            }
            $script.addClass('code_module').appendTo('body')
        })

        o.player_play(true)

        function check_height(){
            var h = $(window).height()
            if(h < 100){
                setTimeout(check_height, 50)
                return
            }
            if(h < document.body.scrollHeight)
                o.send_top('scrollable')
        }
        check_height()
    }
    o.hide = function(){
        visible = false

        o.player_pause(true)

        $('.hive_html').each(function(i, div) {
            var $div = $(div);
            if ($div.html() == '') return;
            $div.attr('data-content',$div.html());
            $div.html('');
        });

        $('.hive_audio .jp-jplayer').each(function(i, div) {
            $(div).jPlayer("pause");
        });

        animate_go = 0
        code_modules.map(function(module){ module.stop && module.stop() })
        $('script.code_module').remove()
    };

    return o
});
