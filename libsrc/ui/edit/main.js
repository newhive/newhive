/* Copyright 2010, A Reflection Of Inc */
// thenewhive.com client-side expression editor version 0.1
define([
    'browser/jquery'
    ,'browser/js'

    ,'ui/menu'
    ,'ui/codemirror'
    ,'ui/dialog'
    ,'ui/util'
    ,'server/context'
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

    ,'browser/jquery/jplayer/skin'
    ,'browser/jquery/rotate.js'
    ,'js!browser/jquery/event/drag.js'
], function(
    $
    ,js

    ,Menu
    ,CodeMirror
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

Hive.grid = false;
Hive.toggle_grid = function() {
    Hive.grid = ! Hive.grid;
    var e = $('#btn_grid').get(0);
    e.src = e.src_d = asset('skin/edit/grid-' + (Hive.grid ? 'on' : 'off') + '.png');
    $('#grid_guide').css(Hive.grid ?
          { 'background-image' : "url('" + asset('skin/edit/grid_square.png') + "')",
              'background-repeat' : 'repeat' }
        : { 'background-image' : '' }
    );
};

Hive.init_menus = function() {
    $('#text_default').click(function(e) {
        hive_app.new_app({ type : 'hive.text', content : '' });
    });
    $('#text_header').click(function(e) {
        hive_app.new_app({ type: 'hive.text', content: '<span style="font-weight:bold">&nbsp;</span>',
            scale : 3 });
    });
    $('.change_zoom').click(function(e) {
        var zooms = [ 1, .5, .25 ];
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

    u.hover_menu('.insert_shape', '#menu_shape');
    $('#shape_rectangle').click(function(e) {
        hive_app.new_app({ type : 'hive.rectangle', content :
            { color : colors[24], 'border-color' : 'black', 'border-width' : 0,
                'border-style' : 'solid', 'border-radius' : 0 } });
    });
    $('#shape_sketch').click(function(e) {
        hive_app.new_app({ type: 'hive.sketch', dimensions: [700, 700 / 1.6]
            ,content: { brush: 'simple', brush_size: 10 } });
    });

    u.hover_menu('.insert_file', '#menu_file');

    $('#btn_grid').click(Hive.toggle_grid);

    $('#media_upload').on('with_files', function(ev, files, file_list){
        // media files are available immediately upon selection
        if (env.gifwall) {
            files = files.filter(function(file, i) {
                var res = (file.mime.slice(0, 6) == 'image/');
                if (!res) file_list.splice(i, 1);
                return res;
            });
        }
        if (env.click_app) {
            env.click_app.with_files(ev, files, file_list);
            env.click_app = undefined;
            return;
        }
        center = u._mul([ev.clientX, ev.clientY])(env.scale());
        u.new_file(files, { center: center });
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
    u.layout_apps();
    layout.center('.app_btns', 'body', {v: false});        
}

Hive.init_global_handlers = function(){
    // Global event handlers
    $(window).on('resize', function(ev) {
        var old_scale = env.scale();
        env.scale_set();
        var new_scale = env.scale();
        if(old_scale == new_scale) return;
        Hive.layout()
    });
    Hive.layout()

    $(window).on('scroll', Hive.scroll);
    evs.on(document, 'keydown');
    evs.on('body', 'mousemove');
    evs.on('body', 'mousedown');
    evs.on('body', 'mouseup');
    // evs.on('body', 'click');
    var drag_base = env.apps_e;
    evs.on(drag_base, 'dragenter');
    evs.on(drag_base, 'dragleave');
    evs.on(drag_base, 'drop');
    evs.on(drag_base, 'draginit');
    evs.on(drag_base, 'dragstart');
    evs.on(drag_base, 'drag');
    evs.on(drag_base, 'dragend');

    // The plus button needs to be clickable, but pass other events through
    $(".prompts .plus_btn").add($(".prompts .hint"))
        .on("dragenter",function(ev) { 
            drag_base.trigger(ev);
            return false;
        })
        .on("dragleave",function(ev) { 
            drag_base.trigger(ev);
            return false;
        })
        .on('dragenter dragover', function(ev){
            ev.preventDefault();
        })
        .on("drop",function(ev) {
            ev.preventDefault();
            drag_base.trigger(ev);
            return false;
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

    $(window).on('beforeunload', function(){
        // TODO-polish-editor: check undo history, or compare expr from server
        // with current state to determine if anything is unsaved
        if(hive_app.Apps.length == 0) return
        return ( "If you leave this page any unsaved " +
            "changes to your expression will be lost." )
    })

    var busy_e = $('.save .loading');
    $(document).ajaxStart(function(){
        busy_e.showshow();
        // TODO: communicate to container that save is in progress
    }).ajaxStop(function(){
        busy_e.hidehide();
        // TODO: communicate to container that save is in progress
    }).ajaxError(function(ev, jqXHR, ajaxOptions){
        // TODO-polish-upload-error: show some warning, and somehow indicate
        // which app(s) failed to save
    });

    $('#btn_save').click(function(){
        var expr = Hive.state();
        window.parent.postMessage({save: expr}, '*')
    })
};

Hive.message = function(ev){
    var msg = ev.data
    if(msg.init)
        Hive.init(msg.expr, msg.context)
}

Hive.pre_init = function(){
    window.addEventListener('message', Hive.message, false)
    window.parent.postMessage({ready: true}, '*')
}

Hive.init = function(exp, site_context){
    // this reference must be maintained, do not assign to Exp
    env.Exp = Hive.Exp = exp;
    // Hive.edit_page = page;
    if(!exp.auth) exp.auth = 'public';
    env.scale_set();

    $.extend(context, site_context)
    env.copy_table = context.flags.copy_table || false;
    env.gifwall = $.inArray('gifwall', exp.tags_index) > -1
    env.squish_full_bleed = env.gifwall;
    env.show_mini_selection_border = 
        env.gifwall || context.flags.show_mini_selection_border;

    if (env.gifwall)
        $("body").addClass("gifwall");
    else
        $("body").addClass("default");
    $('body').append(edit_template())

    Hive.init_dialogs();
    Hive.init_menus();
    // Hive.init_autosave();

    env.apps_e = $('#happs'); // container element for all interactive apps
    env.History.init();
    hive_app.Apps.init(Hive.Exp.apps);
    // Hive.init_common();
    if(context.query.new_user)
        $("#dia_editor_help").data("dialog").open();
    // TODO-cleanup: remove Selection from registered apps, and factor out
    // shared functionality into has_coords
    env.Selection = hive_app.new_app({ type : 'hive.selection' });

    $('.edit.overlay').showshow()
    Hive.init_global_handlers()
    setTimeout(function() { env.layout_apps(); }, 100);
};

Hive.enter = function(){
};

Hive.exit = function(){
    env.zoom_set(1);
    $("body").removeClass("gifwall");
    $("body").removeClass("default");
    $(document).off('keydown');
    $('body').off('mousemove mousedown mouseup click');
};

(function(){
    var focus_classes;

    Hive.focus = function(){
        focus_classes = env.apps_e.attr('class');
        evs.focus();
    };
    Hive.unfocus = function(){
        env.apps_e.attr('class', focus_classes);
        evs.unfocus();
    };
})();

// Matches youtube and vimeo URLs, any URL pointing to an image, and
// creates the appropriate App state to be passed to hive_app.new_app.
Hive.embed_code = function(element) {
    var c = $(element).val().trim(), app
    var v = "", more_args = "", start = 0;
    if(m = c.match(/^https?:\/\/www.youtube.com\/.*?v=([^&]+)(.*)(#t=(\d+))?$/i)) {
        v = m[1];
        more_args = m[2] || "";
        start = m[4] || 0;
    } else if (m = c.match(/src="https?:\/\/www.youtube(-nocookie)?.com\/embed\/(.*?)"/i)
        || (m = c.match(/https?:\/\/youtu.be\/(.*)$/i)))
        v = m[1];
    if (v != "") {
        var args = { 'rel': 0, 'showsearch': 0, 'showinfo': 0 };
        if (start) args['start'] = start;
        var url = '//www.youtube.com/embed/' + v + '?' + $.param(args) + more_args;
        app = { type : 'hive.html', content : 
            "<iframe width='100%' height='100%' class='youtube-player'" +
            "  src='" + url + "' frameborder='0' " +
            "allowfullscreen></iframe>"
        };
            //   '<object type="application/x-shockwave-flash" style="width:100%; height:100%" '
            // + 'data="' + url + '"><param name="movie" value="' + url + '">'
            // + '<param name="allowFullScreen" value="true">'
            // + '<param name="wmode" value="opaque"/></object>' };
    }

    else if(m = c.match(/^https?:\/\/(www.)?vimeo.com\/(.*)$/i))
        app = { type : 'hive.html', content :
            '<iframe src="//player.vimeo.com/video/'
            + m[2] + '?title=0&amp;byline=0&amp;portrait=0"'
            + 'style="width:100%;height:100%;border:0"></iframe>' };

    else if(m = c.match(/^https?:\/\/(.*)mp3$/i))
        app = { type : 'hive.audio', content : {url : c, player : minimal} }

    else if(m = c.match(/https?:\/\/.*soundcloud.com/i)) {
        var stuffs = $('<div>');
        stuffs.html(c);
        var embed = stuffs.children().first();
        if(embed.is('object')) embed.append($('<param name="wmode" value="opaque"/>'));
        if(embed.is('embed')) embed.attr('wmode', 'opaque');
        embed.attr('width', '100%');
        embed.find('[width]').attr('width', '100%');
        embed.find('embed').attr('wmode', 'opaque');
        app = { type : 'hive.html', content : embed[0].outerHTML };
    }

    else if(c.match(/^https?:\/\//i)) {
        var error = function(data, msg){
            alert('Sorry, failed to load url ' + c + '.\n' + msg);
            // Hive.upload_finish();
        };
        var callback = function(data) {
            if( data.error ){
                if(m = c.match(/^https?:\/\/(.*)(jpg|jpeg|png|gif)$/i)){
                    app = { type : 'hive.image', content : c }
                    hive_app.new_app(app);
                } else {
                    return error(false, data.error);
                }
            }
            u.new_file(data);
            $(element).val('');
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

    else {
        var dom = $('<div>');
        dom[0].innerHTML = c;
        dom.find('object').append($('<param name="wmode" value="opaque"/>'));
        dom.find('embed').attr('wmode', 'opaque');
        dom.find('iframe').attr('width', '100%').attr('height', '100%');
        app = { type : 'hive.html', content: dom[0].innerHTML };
    }

    hive_app.new_app(app);
    $(element).val('');
}; 

// TODO-feature-autosave: implement 
Hive.init_autosave = function (){
    setInterval(Hive.set_draft, 5000);
    try { Hive.set_draft(); }
    catch(e) { return "If you leave this page any unsaved changes to your expression will be lost."; }
    var draft = Hive.get_draft();
    if(draft) Hive.Exp = draft;
    Hive.get_draft = function() {
        return localStorage.expr_draft ? JSON.parse(localStorage.expr_draft) : null }
    Hive.set_draft = function() { localStorage.expr_draft = JSON.stringify(Hive.state()); }
    Hive.del_draft = function() { delete localStorage.expr_draft; }
}


// Get and set the JSON object Hive.Exp which represents the edited expression
Hive.state = function() {
    //Hive.Exp.domain = $('#domain').val();
    hive_app.Apps.restack(); // collapse layers of deleted apps
    Hive.Exp.apps = hive_app.Apps.state();

    // get height
    var h = 0;
    for(var i in Hive.Exp.apps) {
        var a = Hive.Exp.apps[i], y = a.dimensions[1] + a.position[1];
        if(y > h) h = y;
    }
    Hive.Exp.dimensions = [1000, Math.ceil(h)];

    return Hive.Exp;
}

// BEGIN-Events  //////////////////////////////////////////////////////

Hive.global_highlight = function(showhide) {
    if (env.gifwall) {
        $(".prompts .highlight").showhide(showhide);
        var fn = showhide ? "mouseover" : 'mouseout';
        $(".prompts .plus_btn").data('hover_showhide')(showhide);
    } else
        $(".editor_overlay").showhide(showhide);
};

// Most general event handlers
Hive.handler_type = 3;
var dragging_count = 0;
Hive.dragenter = function(ev){ 
    // hovers_active(false);
    Hive.global_highlight(true);
    dragging_count++;
    ev.preventDefault();
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
Hive.drop = Hive.dragleave = function(){
    if (dragging_count > 0) 
        --dragging_count;

    if (0 == dragging_count)
        Hive.global_highlight(false);
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
        env.History.undo();
        return false;
    }
    else if(u.is_ctrl(ev) && ev.keyCode == 89){ // ctrl+y
        env.History.redo();
        return false;
    }
    else if(ev.keyCode == 27) // esc
        evs.focused().unfocus()
};

Hive.scroll = function(ev){
    if(env.Selection.controls)
        env.Selection.controls.layout();
    env.Selection.elements().map(function(app){
        if(app.controls) app.controls.layout() });
};
// END-Events /////////////////////////////////////////////////////////

return Hive;

});
