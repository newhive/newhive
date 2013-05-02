define([
    'browser/jquery',
], function($){
    var main = {};

    main.add_hovers = function(){
        $(".hoverable").each(function() { main.hoverable(this) });
    };
    
    main.hoverable = function(o){
        if(o.src) {
            o.src_d = o.src;
            o.src_h = hover_url(o.src_d);
            $(o).mouseover(function() { o.src = o.src_h }).
                mouseout(function() { o.src = o.src_d });
        }
        $(o).mouseover(function() {
            if(main.hoverable.disabled) return;
            $(this).addClass('active');
        }).mouseout(function() {
            if(!$(this).data('busy')) $(this).removeClass('active');
        });

        function hover_url(url) {
            var h = url.replace(/(.png)|(-\w*)$/, '-hover.png');
            var i = $("<img style='display:none'>").attr('src', h);
            $(document.body).append(i);
            return h;
        }
    };
    
    main.update_targets = function(){
        function link_target(i, a) {
            // TODO: change literal to use Hive.content_domain after JS namespace is cleaned up
            var re = new RegExp('^https?://[\\w-]*.?(' + server_name + '|newhiveexpression.com)');
            var a = $(a), href = a.attr('href') || a.attr('action');

            // Don't change target if it's already set
            if (a.attr('target')) return;

            if(href && href.indexOf('http') === 0 && !re.test(href)) {
                a.attr('target', '_blank');
            } else if (href && href.indexOf('http') === 0 && re.test(href)) {
                a.attr('target', '_top');
            }
        }        
        $('a, form').each(link_target);
    }
    

    return main;
});

// TODO: massive cleanup of all below
(function(){
    function asyncUpload(opts) {
        var target, form, opts = $.extend({
            json : true, file_name : 'file', multiple : false, action: '/'
            , start : noop, success : noop, error: noop, input_click: true
            , data : { action : opts.post_action || 'file_create' } 
        }, opts);

        var onload = function() {
            var frame = target.get(0);
            if(!frame.contentDocument || !frame.contentDocument.body.innerHTML) return;
            var resp = $(frame.contentDocument.body).text();
            if(opts.json) {
                try{
                    resp = JSON.parse(resp);
                } catch (e) {
                    // JSON parsing will fail if server returns a 500
                    // Suppress this and call the error callback
                    opts.error(resp);
                }
                if(!opts.multiple){ resp = resp[0]; }
            }
            opts.success(resp);
            form.remove();
        }

        var tname = 'upload' + Math.random();
        form = $('<form>').css({ position: 'absolute', left: -1000 }).addClass('async_upload')
            .attr({ method: 'POST', target: tname, action: opts.action, enctype: 'multipart/form-data' });
        target = $("<iframe style='position : absolute; left : -1000px'></iframe>")
            .attr('name', tname).appendTo(form).load(onload);
        var input = $("<input type='file'>").attr('name', opts.file_name)
            .change(function() { opts.start(); form.submit() }).appendTo(form);
        Hive.profile_upload_input = input;
        if(opts.multiple) { input.attr('multiple', 'multiple'); }
        for (p in opts.data) {
            $("<input type='hidden'>").attr('name', p).attr('value', opts.data[p]).appendTo(form);
        }
        form.appendTo(document.body);
        // It's a mystery why this timout is needed to make the upload dialog appear on some machines
        if (opts.input_click) setTimeout(function() { input.click(); }, 50);
        return form;
    }

    function asyncSubmit(form, callback, opts) {
        var opts = $.extend({ dataType : 'text' }, opts);
        var url = opts.url || $(form).attr('action') || server_url;
        $.post(url, $(form).serialize(), callback, opts.dataType);
        return false;
    }

    /*** puts alt attribute of input fields in to value attribute, clears
     * it when focused.
     * Adds hover events for elements with class='hoverable'
     * ***/
    // $(function () {
    // 
    //     // Cause external links and forms to open in a new window
    //     update_targets();
    // 
    //     if (! Modernizr.touch) {
    //         $(window).resize(function(){
    //             place_apps();
    //         });
    //     }
    //     place_apps();
    // 
    //     dialog_actions = {
    //         comments: function(){ $('#comment_btn').click(); }
    //         , email_invites: function(){ $('#hive_menu .email_invites').click(); }
    //     };
    //     if (urlParams.loadDialog) {
    //         action = dialog_actions[urlParams.loadDialog];
    //         if (action) {
    //             action();
    //         } else {
    //             loadDialog("?dialog=" + urlParams.loadDialog);
    //         }
    //     }
    // 
    //     if( dialog_to_show ){ showDialog(dialog_to_show.name, dialog_to_show.opts); };
    //     if (new_fb_connect) {
    //         _gaq.push(['_trackEvent', 'fb_connect', 'connected']);
    //         showDialog('#dia_fb_connect_landing');
    //     };
    // 
    //     var dia_referral = $('#dia_referral');
    //     dia_referral.find('input[type=submit]').click(function(){
    //         asyncSubmit(dia_referral.find('form'), function(){
    //             dia_referral.find('.btn_dialog_close').click();
    //             showDialog('#dia_sent_invites_thanks');
    //         });
    //         return false;
    //     });
    // });
    // $(window).load(function(){setTimeout(place_apps, 10)}); // position background
        
    var urlParams = {};
    (function () {
        var d = function (s) { return s ? decodeURIComponent(s.replace(/\+/, " ")) : null; }
        if(window.location.search) $.each(window.location.search.substring(1).split('&'), function(i, v) {
            var pair = v.split('=');
            urlParams[d(pair[0])] = d(pair[1]);
        });
    })();

    function hovers_active(state){
        hover_add.disabled = !state;
        hover_menu.disabled = !state;
    }

    function autoLink(string) {
        var re = /(\s|^)(https?:\/\/)?(([0-9a-z-]+\.)+[0-9a-z-]{2,3}(:\d+)?(\/[-\w.~:\/#\[\]@!$&'()*+,;=?]*?)?)([;,.?!]?(\s|$))/ig;
        // groups 1        2             34                       5      6                                   7
        // 1: this ends up excluding existing links <a href="foo.bar">foo.bar</a>
        // 2: optional http(s):// becomes capture group 2
        // 3: The url after the http://
        // 5: Optional path
        // 7: Trailing punctuation to be excluded from URL. Note that the
        //    path is non greedy, so this will fail to correctly match a valid but
        //    uncommon case of a URL with a query string that ends in punctuation.
        function linkify(m, m1, m2, m3, m4, m5, m6, m7) {
            var href = ((m2 === '') ? 'http://' : m2) + m3; // prepend http:// if it's not already there
            return m1 + $('<a>').attr('href', href).text(m2 + m3).outerHTML() + m7; 
        }
        return string.replace(re, linkify);
    }

});