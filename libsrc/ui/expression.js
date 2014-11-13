/* Expression
  Defines the behavior of the expression frame.
  Expression interacts with its parent frame, the main site,
    via postMessage.
*/
define([
    'browser/jquery'
    ,'browser/js'
    ,'context'
    ,'browser/layout'
    ,'ui/jplayer'
    ,'ui/util'
    ,'ui/media_players'
    ,'analytics'

    ,'browser/jquery/jplayer/skin'
    ,'browser/jquery/rotate.js'
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

    var last_message = '';
    o.send_top = function(msg){
        if(last_message == msg) return;
        window.parent.postMessage(msg, '*');
        // These messages are NOT idempotent
        if (msg != "next" && msg != "prev")
            last_message = msg;
    };
    
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
        $(document).mousemove(check_hover);
        $(document).click(expr_click);
        // $(document).mouseleave(function(e) { window.setTimeout(clear_hover, 600, e); });

        if (!util.mobile()) {
            var zoom = layout.get_zoom()
            $(window).resize(function(){
                var new_zoom = layout.get_zoom()
                if(new_zoom == zoom) o.layout()
                zoom = new_zoom
            })
        }
        $(window).on("scroll", layout.on_scroll)
            .click(function(){ o.send_top('focus'); });
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

        //     if( (delta[0] > 0 && document.body.scrollLeft > 0) // left scroll remains
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

    o.expr_receive = function(ev){
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
        else if( msg.action == 'play_toggle' ) o.autoplay_toggle()
    }

    o.margin = function () {
        return $(window).width() / 4;
    }
    var expr_click = function (e) {
        o.send_top("expr_click");
    }
    var clear_hover = function (e) {
        o.send_top("hide_prev"); // $('.page_btn.page_prev').hidehide();
        o.send_top("hide_next"); // $('.page_btn.page_next').hidehide();
    }
    var check_hover = function (e) {
        if (e.clientX < o.margin()) {
            o.send_top("show_prev"); //$('.page_btn.page_prev').showshow();
        } else if (e.clientX > $(window).width() - o.margin()) {
            o.send_top("show_next"); //$('.page_btn.page_next').showshow();
        } else {
            o.send_top("hide"); // $('.page_btn.page_prev').hidehide();
        }
    }

    // autoplay state. play_playing is the intent, so remains true after hide()
    var autoplayers = [], autoplay_current = -1, autoplay_playing = false,
        autoplay_loop = false, player_constructors = [], autoplay_pos = 0
    o.add_player_type = function(constructor){
        player_constructors.push(constructor) }
    o.get_player = function(el){
        for(var i = 0; i < player_constructors.length; i++){
            var player = player_constructors[i](el)
            if(player) return player
        }
        return false // not supported
    }

    var autoplay_no_update = false
    var autoplay_update = function(i, playing){
        if(autoplay_no_update){
            autoplay_no_update = false
            return
        }
        if(playing == autoplay_playing) return
        autoplay_current = i
        autoplay_playing = playing
        o.send_top(playing ? 'play' : 'play_pause')
    }
    o.autoplay_pause = function(freeze){
        var player = autoplayers[autoplay_current]
        if(!player) return
        if(freeze) autoplay_no_update = true
        autoplay_pos = player.pause()
    }
    o.autoplay = function(resume){
        if(!autoplayers.length) return
        if(resume && !autoplay_playing){
            o.send_top('play_pause')
            return
        }
        if(autoplay_current == -1) autoplay_current = 0
        var player = autoplayers[autoplay_current]
        if(!player) return
        player.play(autoplay_pos)
        autoplay_update(true)
    }
    o.autoplay_toggle = function(){
        if(autoplay_playing) o.autoplay_pause()
        else o.autoplay()
    }
    o.autoplay_next = function(){
        autoplay_current++
        if (autoplay_loop)
            autoplay_current %= autoplayers.length
        else if (autoplay_current >= autoplayers.length){
            autoplay_current = -1
            autoplay_playing = false
        }
        var player = autoplayers[autoplay_current]
        if(!player) return
        player.play()
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
        autoplayers = $.map( $(".happ.autoplay").sort(function(a,b) {
            return a.getBoundingClientRect().top - b.getBoundingClientRect().top 
        } ), o.get_player )
        $.each(autoplayers, function(i, player){
            player.finish(o.autoplay_next)
            player.play_change(function(playing){
                autoplay_update(i, playing) })
        })
        if(autoplayers[0])
            autoplayers[0].ready(function(){ o.autoplay() })

        if (util.mobile()) o.layout()
    };

    o.link_target = function(a){
        var $a = $(a);
        if ($a.attr('target')) return;
        // TODO: Match against internal links and use routing system

        var re = new RegExp('^(https?:)?//[\\w-]*.?(' +
            context.config.server_domain + '|' +
            context.config.content_domain + ')');
        var href = $a.attr('href') || $a.attr('xlink:href') || $a.attr('action')
        if (!href) return

        var non_relative = 
            (href.indexOf('http') === 0 || href.slice(0,2) == "//")

        if (href && non_relative && !re.test(href)) {
            $a.attr('target', '_blank');
        } else if (href && non_relative && re.test(href)) {
            $a.attr('target', '_top');
        } else if (!context.referer && href && !non_relative && href.match(/^\/\w/)) {
            // force relative links to top
            $a.attr('href', context.config.server_url.replace(/\/$/, '') + href);
            $a.attr('target', '_top');
        }
    };

    // called from script element generated from
    // python newhive.controller.expr.html_for_app for each code app
    var code_srcs = [], code_modules = [], animate_go
    o.load_code = function(code_src){
        code_srcs.push(code_src) }

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

        o.update_targets();

        code_srcs.map(function(src){
            var script = $('<script>').html(
                "curl(['browser/jquery','ui/expression'],function($, expr){"
                + "var self={};" + src + ";expr.run_code(self) })"
            ).addClass('code_module').appendTo('body')
        })

        o.autoplay(true)
    }
    o.hide = function(){
        visible = false

        o.autoplay_pause(true)

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


    // All links in content frame need to target either
    // the top frame (on site) or a new window (off site)
    o.update_targets = function(){
        // function link_target(i, a) {
        //     // TODO: change literal to use Hive.content_domain after JS namespace is cleaned up
        //     var re = new RegExp('^https?://[\\w-]*.?(' + server_name + '|newhiveexpression.com)');
        //     var a = $(a), href = a.attr('href') || a.attr('action');
        // 
        //     // Don't change target if it's already set
        //     if (a.attr('target')) return;
        // 
        //     if(href && href.indexOf('http') === 0 && !re.test(href)) {
        //         a.attr('target', '_blank');
        //     } else if (href && href.indexOf('http') === 0 && re.test(href)) {
        //         a.attr('target', '_top');
        //     }
        // }
        // TODO: Re-enable link targeting  
        return;
        // $('a, form').each(link_target);
    }

    return o
});
