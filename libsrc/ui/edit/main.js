/* Copyright 2010, A Reflection Of Inc */
// thenewhive.com client-side expression editor version 0.1
define([
    'jquery'
    ,'browser/js'

    ,'ui/menu'
    ,'ui/dialog'
    ,'ui/util'
    ,'context'
    ,'ui/colors'
    ,'browser/upload'
    ,'browser/layout'

    ,'./apps'
    ,'./util'
    ,'./events'
    ,'./env'
    ,'./selection'
    ,'sj!templates/edit_sandbox.html'

    ,'./text'
    ,'./history'

    ,'jquery/jplayer/skin'
    ,'jquery/rotate.js'
    ,'js!jquery/event/drag.js'
], function(
    $
    ,js

    ,Menu
    ,dialog
    ,ui_util
    ,context
    ,colors
    ,upload
    ,layout

    ,hive_app
    ,u
    ,evs
    ,env
    ,selection
    ,edit_template
){

var Hive = {}
    ,debug_mode = context.config.debug_mode
    ,noop = function(){}
    ,Funcs = js.Funcs
    ,asset = ui_util.asset
;
Hive.asset = asset;

// Expose to outside for debugging
window.h = Hive
Hive.u = u;
Hive.env = env;
Hive.app = hive_app;
env.main = Hive

Hive.help_selection = function (start) {
    start = ui_util.defalt(start, true)
    var $elems = $("body #happs .happ, #controls .control.buttons > *, .app_btns > *")
        ,$highlight = $("#overlays_group .help_highlight")
        ,$help_target, depth = 0
    if (!$highlight.length) 
        $highlight = $("<div class='help_highlight'>").appendTo("#overlays_group")
    $elems = $elems.add($highlight)
    $("body").toggleClass("help", start)
    Menu.no_hover = start
    if (!start) {
        $elems.off("mouseenter.help mouseleave.help mousedown.help")
        $highlight.hidehide()
        return
    }

    // start == true
    $elems.bind_once_anon("mouseenter.help mouseleave.help",function(ev) {
        var $target = $(ev.currentTarget), enter = (ev.type == "mouseenter")
            ,css = $target.get(0).getBoundingClientRect()
        depth += enter ? 1 : -1
        if (!depth) setTimeout(function() {
            $highlight.showhide(depth)
            // $help_target = undefined
        },100)
        if ($(ev.currentTarget).is(".help_highlight"))
            return
        if (enter)
            $help_target = $target
        $highlight.showshow().css(css)
    })
    .add($("body, body *")).bind_once_anon("mousedown.help", function(ev) {
        $("body, body *").off("mousedown.help")
        Hive.help_selection(false)
        if (! $(this).is(".help_highlight"))
            return false
        var klasses = $help_target.attr("class")
            , help_file = "File not found. " + klasses
            , help_files = {
                ".happ.hive_image": "#images"
                ,".insert_image": "#images"
                ,".happ.hive_text": "#text"
                ,".insert_text": "#text"
                ,".happ.hive_audio": "#audio"
                ,".insert_audio": "#audio"
                // ,".happ.hive_html": "#embeds"
                ,".insert_embed": "#embeds"
                ,".happ.hive_polygon": "#shapes"
                ,".insert_shape": "#shapes"
                // ,".happ.hive_polygon": "#shapes"
                ,".insert_file": "#files"
                // ,".happ": "Generic App"
                // ,".button.opacity": "Set opacity"
            }
        for (var selector in help_files) {
            if ($help_target.is(selector)) {
                help_file = help_files[selector]
                break
            }
        }
        if (help_file[0] != "#") {
            if (context.flags.can_debug)
                u.set_debug_info(help_file, 5000)
            help_file = "#general"
        }
        $("#dia_editor_help").data("dialog").open()
        var $iframe = $("#dia_editor_help iframe")
            ,url = $iframe.prop("src").replace(/#.*$/, '')
        $iframe.prop("src", url + help_file)
        return false
    })
}

var _grid = false
Hive.grid_toggle = function() {
    _grid = ! _grid
    $('.grid_btn.off').showhide(!_grid)
    $('.grid_btn.on').showhide(_grid)
    $('#grid_guide rect')[0].classList[_grid ? 'remove' : 'add']('hide')
}

Hive.init_menus = function() {
    if (context.flags.context_help) {
        $("#btn_help").bind_once_anon("click", function(ev) {
            Hive.help_selection()
        })
    }

    hive_app.App.has_slider_menu(null, ""
        ,env.padding_set, env.padding, null, null
        ,{ min: 0, max: 30, quant: 1
        , handle:$('.menu_item.change_padding'), container:$('#dynamic_group')
        , css_class: 'padding_menu'
        , menu_opts: { 
            layout_x: "submenu"
            ,layout: "left"
            ,group: $(".misc.handle").data("menu")
            ,auto_height: false 
        }
    }).controls()

    $('.grid_btn').click(Hive.grid_toggle);
    hive_app.App.has_slider_menu(null, ""
        ,function(s){
            if(!_grid) Hive.grid_toggle()
            env.grid_set(s)
        }
        ,env.grid, null, null
        ,{ min: 5, max: 100, quant: 1
        , handle:$('.menu_item.change_grid'), container:$("#dynamic_group")
        , css_class: 'grid_menu'
        , menu_opts: { 
            layout_x: "submenu"
            ,layout: "left"
            ,group: $(".misc.handle").data("menu")
            ,auto_height: false 
        }
    }).controls()

    $('#text_default').click(function(e) {
        hive_app.new_app({ type : 'hive.text', content : '' });
    });
    $('#text_header').click(function(e) {
        hive_app.new_app({ type: 'hive.text', content: '<span style="font-weight:bold">&nbsp;</span>',
            scale : 3 });
    });
    var zooms = [ 1, .5, .25 ];
    $('.change_zoom').click(function(e) {
        var zoom = env.zoom();
        // NOTE: indexOf will return -1 for unlisted zoom, so it will just
        // zoom to zooms[0] in that case.
        var i = (zooms.indexOf(zoom) + 1) % zooms.length;
        env.zoom_set(zooms[i]);
    });

    u.hover_menu('.insert_text', '#menu_text');

    var image_menu = u.hover_menu('.insert_image', '#menu_image');
    var image_embed_menu = u.hover_menu('#image_from_url', '#image_embed_submenu', {
        click_persist: $('#image_embed_code'), auto_close: false,
        open: function(){
            $('#image_embed_code').focus();
        }, group: image_menu
    });
    $('#embed_image_form').submit(function(){
        Hive.embed_code('#image_embed_code');
        image_embed_menu.close();
        image_menu.close();
        return false;
    });

    u.hover_menu('.insert_audio', '#menu_audio');

    var embed_menu = u.hover_menu('.insert_embed', '#menu_embed', {
        open: function(){ $('#embed_code').get(0).focus() },
        layout_x: 'center' });
    $('#embed_done').click(function() { Hive.embed_code('#embed_code'); embed_menu.close(); });
    var js_module = "self.run = function(){"
        + "\n  console.log('hello NewHive')"
        + "\n}"
        + "\nself.stop = function(){"
        + "\n  // unload event handlers, clean up"
        + "\n}"
        + "\n// self.animate = function(){"
        + "\n// }"
    $('#menu_embed .code').click(function() {
        embed_menu.close()
        hive_app.new_app({ type: 'hive.code', content: js_module,
            code_type: 'js', position: [50,50], dimensions: [450, 480] })
    })
    $('#menu_embed .style').click(function(){
        embed_menu.close()
        Hive._embed_code('<style>')
    })
    // TODO: implement by using a local template, just duplicate it and add.
    var p5_code = "var p5"
        + "\n"
        + "\nfunction draw(){"
        + "\n  p5.fill(128)"
        + "\n  p5.stroke('black')"
        + "\n  p5.strokeWeight(5)"
        + "\n  p5.ellipse(p5.width/2, p5.height/2, 65, 65)"
        + "\n}"
        + "\nfunction setup(){"
        + "\n}"
        + "\n"
        + "\nself.run = function() {"
        + "\n  var $box = $('#bg')"
        + "\n  p5 = new P5(function(){}, $box[0])"
        + "\n  setup()"
        + "\n  p5.windowResized = function(){"
        + "\n    p5.resizeCanvas($box.width(), $box.height())"
        + "\n  }"
        + "\n  p5.windowResized()"
        + "\n  p5.draw = draw"
        + "\n}"
        + "\nself.stop = function() {"
        + "\n  if(p5){"
        + "\n    p5.noLoop()"
        + "\n    p5.noCanvas()"
        + "\n  }"
        + "\n}"
    $('#menu_embed .processing').click(function() { 
        embed_menu.close();
        var code = hive_app.new_app({ type: 'hive.code', content: p5_code,
            code_type: 'js', position: [50,50], dimensions: [450, 480] })
        code.add_import('P5', 'p5')
    });

    u.hover_menu('.insert_shape', '#menu_shape');
    var default_size = [150, 150]
    Hive.template_shape_base = {
        "type": "hive.polygon"
        , "style": {"stroke-width": 0}
    }
    Hive.template_rect = { 
        type : 'hive.rectangle'
        , dimensions: default_size
        , css_state : {
            'background-color' : "#000"
            // 'background-color' : colors[24]
            , 'border-color' : 'black'
            , 'border-width' : 0
            , 'border-style' : 'solid' 
        }
    };
    Hive.template_circle = {
        type : 'hive.circle'
        , dimensions: default_size
        , css_state : { 
            'background-color' : "#000"
            ,'border-color' : 'black'
            ,'border-width' : 0 // 1
            ,'border-style' : 'solid' 
        }
    };

    $('#menu_shape .rect').click(function(ev) {
        poly.mode(Hive.template_rect)
        poly.focus()
    });
    $('#menu_shape .circle').click(function(ev) {
        poly.mode(Hive.template_circle)
        poly.focus()
    });
    $('#menu_shape .sketch').click(function(e) {
        hive_app.new_app({ type: 'hive.sketch', dimensions: [700, 700 / 1.6]
            ,content: { brush: 'simple', brush_size: 10 } });
    });

    // polygon shapes
    var poly = hive_app.App.Polygon
    var phi = (Math.sqrt(5) + 1) / 2
    var scale_default = function(points) {
        return points.map(function(p) { return u._mul(default_size, p) })
    }
    Hive.template_line = $.extend({}, Hive.template_shape_base, {
        "points": scale_default([[0, 0], [1, 0]])
        ,"style": {"stroke-width": 4}
    })
    Hive.template_triangle = $.extend({}, Hive.template_shape_base, {
        "points": scale_default(
            [[.5,0], [1, Math.sqrt(3)/2], [0, Math.sqrt(3)/2]])
    })
    Hive.template_pentagram = $.extend({}, Hive.template_shape_base, {
        points: js.range(10).map(function(i){
            var d = ((i == 0 ? 0 : Math.PI*2*i/10) + Math.PI/10)
                ,r = (i % 2) ? 1 : (1 - 1 / phi)
                ,p = [Math.cos(d), Math.sin(d)]
            return u._mul(p, r, .5, default_size)
        })
    })
    Hive.template_hexagon = $.extend({}, Hive.template_shape_base, {
        points: js.range(6).map(function(i){
            var d = (i == 0 ? 0 : Math.PI*2*i/6)
                ,p = [Math.cos(d), Math.sin(d)]
            return u._mul(p, .5, default_size)
        })
    })
    $('#menu_shape .triangle').click(function(){
        poly.mode(Hive.template_triangle)
        poly.focus()
    })
    $('#menu_shape .line').click(function(){
        poly.mode(Hive.template_line)
        poly.focus()
    })
    $('#menu_shape .pentagram').click(function(){
        poly.mode(Hive.template_pentagram)
        poly.focus()
    })
    $('#menu_shape .hexagon').click(function(){
        poly.mode(Hive.template_hexagon)
        poly.focus()
    })
    $('#menu_shape .free_form').click(function(){
        poly.mode(false)
        poly.focus()
    })

    u.hover_menu('.insert_file', '#menu_file');


    $('#media_upload').on('with_files', function(ev, files, file_list){
        // media files are available immediately upon selection
        if (env.click_app) {
            env.click_app.with_files(ev, files, file_list);
            env.click_app = undefined;
            return;
        }
        var opts = {}, center = [$(window).width()/2, $(window).height()/2]
        if (env.dragging)
            opts.center_offset = u._sub([env.dragX, env.dragY], center);
        u.new_file(files, opts);
    }).on('success', function(ev, files){ u.on_media_upload(files) });

    $('#link_upload').on('with_files', function(ev, files){
        // TODO-polish: maybe create link text box first
    }).on('success', function(ev, files){
        Hive.Exp.background.url = files[0].url;
        // TODO-polish: maybe deal with multiple files
        var file = files[0];
        var app = { type: 'hive.text', content:
                $('<a>').attr('href', file.url).text(file.name)[0].outerHTML,
            file_name: file.name
        };
        hive_app.new_app(app);
    });
};

Hive.init_dialogs = function() {
    // TODO-refactor: separate background dialog, save dialog, and top level
    // menus into respective constructors

    // TODO-polish: Show error for old browsers
    // var ua = navigator.userAgent;
    // if ( !ua.match(/(Firefox|Chrome|Safari)/i) || ua.match(/OS 5(_\d)+ like Mac OS X/i)) {
    //     u.show_dialog('#editor_browsers');
    // }
    hive_app.init_background_dialog();
};

Hive.layout = function(){
    env.canvas_size_update()
    layout.center('.app_btns', 'body', {v: false});        
}

Hive.save_safe = true
Hive.init_global_handlers = function(){
    // Global event handlers
    $(window).on('resize', Hive.layout)

    $(window).on('scroll', Hive.scroll);
    Hive.scroll();
    evs.on(document, 'keydown');
    evs.on('body', 'mousemove');
    evs.on('body', 'mousedown');
    evs.on('body', 'mouseup');
    // evs.on('body', 'click');
    var drag_base = $('body')
    evs.on(drag_base, 'dragenter');
    evs.on(drag_base, 'dragleave');
    evs.on(drag_base, 'drop');
    evs.on(drag_base, 'draginit');
    evs.on(drag_base, 'dragstart');
    evs.on(drag_base, 'drag');
    evs.on(drag_base, 'dragend');
    evs.on(drag_base, 'dragover');

    // The plus button needs to be clickable, but pass other events through
    $(".prompts .plus_btn").add($(".prompts .hint"))
        .on("drop dragenter dragleave",function(ev) { 
            ev.preventDefault();
            drag_base.trigger(ev);
            return false;
        })
        .on('dragover', function(ev){
            ev.preventDefault();
            drag_base.trigger("dragover");
        })
        .on("mouseenter", function(ev){
            drag_base.trigger("dragenter");
        })
        .on("mouseleave", function(ev) {
            drag_base.trigger("dragleave");
        });

    evs.handler_set(env.Selection);
    evs.handler_set(Hive);
    env.apps_e.addClass('default');
    u.cursor_set('default')

    var busy_e = $('.save .loading');
    $(document).ajaxStart(function(){
        busy_e.showshow();
        Hive.save_safe = false
        $("#btn_save span").text("Saving ")
        Hive.send({save_safe: Hive.save_safe})
    }).ajaxStop(function(){
        busy_e.hidehide();
        Hive.save_safe = true
        Hive.send({save_safe: Hive.save_safe})
    }).ajaxError(function(ev, jqXHR, ajaxOptions){
        // TODO-polish-upload-error: show some warning, and somehow indicate
        // which app(s) failed to save
    });

    $('#btn_save').click(function(){
        // TODO: need mechanism for code apps to auto-update (autosave)
        // and indicate whether they have received their data before
        // allowing save
        env.Apps.filter(function(a) {
            a.run_module_func && a.run_module_func("on_save")
            return false
        })

        var expr = Hive.state();
        Hive.send({save_dialog: 1})
    })
    var has_revert = (revert.apps || revert.background)
    $(".menu_item.revert").toggleClass("hide", !has_revert)
        .prop('disabled', !has_revert)
    $(".menu_item.revert").bind_once_anon("click", function(ev) {
        if (!has_revert) return
        env.History.begin()
        // Delete the current version of all apps
        hive_app.Apps.all().map(function(a) {
            a.remove()
        })
        // Add in all the apps in the revert save
        if (revert.apps)
            $.map(revert.apps, function(a){ env.new_app(a, { no_select: true }) } )
        if (revert.background) {
            // TODO-refactor: move this into a bg_set_history func
            history_point = env.History.saver(
                function(){ return $.extend(true, {}, env.Exp.background) },
                hive_app.bg_set, 'change background')
            hive_app.bg_set(revert.background);
            history_point.save()
        }

        env.History.group("revert")
    })
    // Prevent hidden forms from stealing focus 
    // (fixes ctrl-a going to client, and doing native select-all)
    $("input[readonly]").on("focus",function(e){ $(this).blur() })
};

Hive.receive = function(ev){
    var msg = ev.data
    if (msg.init) {
        Hive.init(msg.expr, msg.context, msg.revert)
    } else if(msg.autosave) {
        $("#btn_save span").text("Saved ")
        Hive.autosave_time = msg.autosave
        env.exit_safe_set(true)
    } else if(msg.focus) {
        window.focus()
    } else if(msg.save_request) {
        Hive.send({save: Hive.state()})
    }
}
Hive.send = function(m){
    window.parent.postMessage(m, '*') }

Hive.pre_init = function(){
    window.addEventListener('message', Hive.receive, false)
    Hive.send({ready: true})
}

var revert = {}, exit_safe = true
env.exit_safe_set = function(v){
    if(v == exit_safe) return
    Hive.send({exit_safe: v})
    exit_safe = v
}

Hive.init = function(exp, site_context, _revert){
    revert = _revert
    // this reference must be maintained, do not assign to Exp
    env.Exp = Hive.Exp = exp
    // Hive.edit_page = page;
    if(!exp.auth) exp.auth = 'public'
    env.scale_set()
    env.layout_coord = Hive.Exp.layout_coord || 0

    $.extend(context, site_context)
    Hive.context = context
    env.show_css_class = false
    env.copy_table = context.flags.copy_table || false

    $("body").addClass("default");
    context.flags.UI.transition_test && $("body").addClass("transition_test")
    $('body').append(edit_template())

    Hive.init_dialogs();
    Hive.init_menus();
    var last_autosave
    Hive.autosave_time = 0
    var saver = js.throttle(function(save) {
        $("#btn_save span").text("Saving ")
        Hive.send(save)
        env.exit_safe_set(false)
    }, 10000, null, {ensure: true})
    setInterval(function() {
        // Only autosave if something has changed
        var expr = Hive.state()
        if (!env.History.saves_pending() && Hive.save_safe && !u.deep_equals(last_autosave, expr)) {
            // console.log("try save")
            last_autosave = $.extend(true, {}, expr)
            if (Hive.autosave_time == 0) {
                Hive.autosave_time = 1
                return
            }
            saver({save: expr, autosave:1})
        }
    } , 1000)

    env.apps_e = $('#happs'); // container element for all interactive apps
    env.History.init();
    // Hive.init_common();
    if(context.query.new_user)
        $("#dia_editor_help").data("dialog").open();
    // TODO-cleanup: remove Selection from registered apps, and factor out
    // shared functionality into has_coords
    env.Selection = hive_app.new_app({ type : 'hive.selection' });
    hive_app.bg_set(env.Exp.background);
    env.Background = hive_app.App.Background()
    hive_app.Apps.init(Hive.Exp.apps);
    hive_app.Apps.restack();
    env.Groups.init(Hive.Exp.groups || []);
    Hive.Exp.globals = Hive.Exp.globals || {}
    $.each(env.globals_set, function(name, func) {
        func(Hive.Exp.globals[name])
    })
    last_autosave = $.extend(true, {}, Hive.state())
    env.zoom_set(1)

    $('.edit.overlay').showshow()
    Hive.init_global_handlers()
    setTimeout(Hive.layout, 100);
};

Hive.enter = function(){
};

Hive.exit = function(){
    env.zoom_set(1);
    $(document).off('keydown');
    $('body').off('mousemove mousedown mouseup click').removeClass("default")
}

var focus_classes;
Hive.focus = function(){
    focus_classes = env.apps_e.attr('class');
    evs.focus();
}
Hive.unfocus = function(){
    env.apps_e.attr('class', focus_classes);
    evs.unfocus();
}

// Matches youtube and vimeo URLs, any URL pointing to an image, and
// creates the appropriate App state to be passed to hive_app.new_app.
//
// TODO-feature-html-embed: iterate over each element, and do something
// reasonable
Hive.embed_code = function(element) {
    var c = $(element).val().trim()
    $(element).val('');

    Hive._embed_code(c)
}
// TODO: move globals out of env (This one belongs in "creators" module)
env.embed_code = Hive._embed_code = function(c) {
    var app = {}
        ,frame = $('<iframe>').css({width:'100%',height:'100%',border:0})
            .attr('allowFullScreen', true)
        ,args, url, v = "", more_args = "", start = 0
    ;

    if(m = c.match(/^https?:\/\/www.youtube.com\/.*?v=([^&]+)(.*)(#t=(\d+))?$/i)) {
        v = m[1];
        more_args = m[2] || "";
        start = m[4] || 0;
    } else if (m = c.match(/src="https?:\/\/www.youtube(-nocookie)?.com\/embed\/(.*?)"/i)
        || (m = c.match(/https?:\/\/youtu.be\/(.*)$/i)))
        v = m[1];
    if (v != "") {
        args = { rel: 0, showsearch: 0, showinfo: 0, autohide: 1, enablejsapi: 1 }
        if (start) args['start'] = start;
        url = '//www.youtube.com/embed/' + v + '?' + $.param(args) + more_args;
        frame.addClass('youtube-player').attr('src', url)
        app = { type: 'hive.html', content: frame[0].outerHTML, media: 'youtube' }
    }

    else if(m = c.match(/^https?:\/\/(www.)?vimeo.com\/(.*)$/i)) {
        frame.attr('src', '//player.vimeo.com/video/'
            + m[2] + '?title=0&amp;byline=0&amp;portrait=0')
        app = { type: 'hive.html', content: frame[0].outerHTML, media: 'vimeo' }
    }

    else if(m = c.match(/^https?:\/\/(.*)mp3$/i)) {
        app = { type : 'hive.audio', content : {url : c, player: minimal}
            ,media: 'hive.audio' }
    }

    else if(m = c.match(/https?:\/\/.*soundcloud.com/i)) {
        app = { media: 'soundcloud' }
        var stuffs = $('<div>');
        stuffs.html(c);

        if(!stuffs.children().length){
            var args = { auto_play: false, hide_related: true, visual: true, url: c }
            frame.attr('src', 'https://w.soundcloud.com/player/' +'?'+ $.param(args))
            app.type = 'hive.html'
            app.content = frame[0].outerHTML
        }
    }

    else if(c.match(/^https?:\/\//i)) {
        var error = function(data, msg){
            alert('Sorry, failed to load url ' + c + '.\n' + msg);
            // Hive.upload_finish();
        };
        var callback = function(data) {
            if( data.error ){
                if(m = c.match(/^https?:\/\/(.*)(jpg|jpeg|png|gif|svg)$/i)){
                    app = { type : 'hive.image', content : c }
                    hive_app.new_app(app);
                } else {
                    return error(false, data.error);
                }
            }
            u.new_file(data);
        }
        // Hive.upload_start();
        $.ajax($('#media_upload').attr('action'), {
            data: { remote: true, url: c }
            , success: callback
            , dataType: 'json'
            , error: error
            , type: 'POST'
        });
        return;
    }

    if(!app.type){
        var el = $(c).eq(0)
        if(el.is('script')){
            app = { type: 'hive.code', content: el.html(), code_type: 'js' }
            var url = el.attr('src')
            if(url){
                app.url = url
                delete app.content
            }
        }
        else if(el.is('style')){
            app = { type: 'hive.code', content: el.html(), code_type: 'css' }
            var url = el.attr('href')
            if(url){
                app.url = url
                delete app.content
            }
        }
    }

    if(!app.type){
        var dom = $('<div>');
        dom[0].innerHTML = c;
        dom.find('object').append($('<param name="wmode" value="opaque"/>'));
        dom.find('embed').attr('wmode', 'opaque');
        dom.find('iframe').attr('width', '100%').attr('height', '100%');
        app.type = 'hive.html'
        app.content = dom[0].innerHTML
    }

    return hive_app.new_app(app);
}; 

// TODO-feature-autosave: implement 
// See also https://developer.mozilla.org/en-US/docs/Web/Guide/API/DOM/Storage
// Hive.init_autosave = function (){
//     o = {}

//     o.save_draft = function() {
//         Hive.send({save: Hive.state(), autosave:1})
//     }
//     o.get_draft = function() {}
    
//     // setInterval(Hive.set_draft, 5000);
//     // try { Hive.set_draft(); }
//     // catch(e) { return "If you leave this page any unsaved changes to your newhive will be lost."; }
//     // var draft = Hive.get_draft();
//     // if(draft) Hive.Exp = draft;
//     // Hive.get_draft = function() {
//     //     return localStorage.expr_draft ? JSON.parse(localStorage.expr_draft) : null }
//     // Hive.set_draft = function() { localStorage.expr_draft = JSON.stringify(Hive.state()); }
//     // Hive.del_draft = function() { delete localStorage.expr_draft; }

//     return o
// }


// Get and set the JSON object Hive.Exp which represents the edited expression
Hive.state = function() {
    //Hive.Exp.domain = $('#domain').val();
    hive_app.Apps.restack(); // collapse layers of deleted apps
    Hive.Exp.apps = hive_app.Apps.state();
    Hive.Exp.groups = env.Groups.state()
    Hive.Exp.globals = {}
    $.each(env.globals, function(name, func) {
        Hive.Exp.globals[name] = func()
    })

    // TODO: get height/maximum dimension
    // var h = u.app_bounds(env.Apps.all()).bottom
    // Hive.Exp.dimensions = [1000, Math.ceil(h)];

    return Hive.Exp;
}

// BEGIN-Events  //////////////////////////////////////////////////////

Hive.global_highlight = function(showhide) {
    $(".editor_overlay").showhide(showhide)
}

// Most general event handlers
Hive.handler_type = 3;
var dragging_count = 0;
Hive.dragenter = function(ev){ 
    // hovers_active(false);
    env.dragging = true 
    Hive.global_highlight(true);
    dragging_count++;
    ev.preventDefault();
    return false;
};
Hive.dragover = function(ev){ 
    env.dragX = ev.originalEvent.clientX
    env.dragY = ev.originalEvent.clientY
};
Hive.dragstart = function(){ 
    // hovers_active(false);
    // Hive.global_highlight(true);
};
Hive.dragend = function(){
    // TODO-usability: fix disabling hover states in ui/util.hoverable
    // hovers_active(true)

    // In case scrollbar has been toggled:
    u.layout_apps();
};
Hive.drop = Hive.dragleave = function(ev){
    if (dragging_count > 0) 
        --dragging_count;

    if (0 == dragging_count) {
        Hive.global_highlight(false);
        if (ev.type == "drop") setTimeout(function(){ 
            env.dragging = false
        }, 100)
    }
    return false;
};
// TODO-feature-editor-prompts: could be used in handlers for non-pointer
// events, like in a type to add text box handler
// Hive.mouse_pos = [0, 0];
// Hive.mousemove = function(ev){
//     Hive.mouse_pos = [ev.clientX, ev.clientY];
// };
Hive.keydown = function(ev){
    // TODO-feature-editor-prompts #706: if key pressed is a word character,
    // create hive.text app with content of the character pressed

    if(u.is_ctrl(ev) && ev.keyCode == 90){ // ctrl+z
        env.History.undo(ev.shiftKey ? 10 : 1)
        return false;
    }
    else if(u.is_ctrl(ev) && ev.keyCode == 89){ // ctrl+y
        env.History.redo(ev.shiftKey ? 10 : 1)
        return false;
    }
    else if(ev.keyCode == 27) // esc
        evs.focused().unfocus()
};

Hive.scroll = function(ev){
    var scrolled = u._sub( [window.scrollX, window.scrollY], env.scroll )
        ,has_fixed = false
    env.scroll = u._add( env.scroll, scrolled )
    env.Apps.all().map(function(app){
        if (app.fixed()) {
            app.pos_set(u._add(app.pos(), scrolled))
            has_fixed = true
        }
    })
    if (has_fixed)
        env.Selection.update_relative_coords()
    if (env.Selection.controls)
        env.Selection.controls.layout()
    env.Selection.elements().map(function(app){
        if (app.controls) app.controls.layout() 
    })
    env.Background.layout()
};
// END-Events /////////////////////////////////////////////////////////

return Hive;

});
