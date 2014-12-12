define([
    'browser/jquery',
    'json!server/compiled.assets.json',
    'browser/js',
    'browser/jquery/nh_utils',
    'browser/jquery/easing',
    'browser/jquery/event/mobile'
], function($, assets, js){
    var o = {};

    // Math
    // Vector functions
    // Return -1 if x < 0, 1 if x > 0, or 0 if x == 0.
    o._sign = function(x) {
        return typeof x === 'number' ? x ? x < 0 ? -1 : 1 : x === x ? 0 : NaN : NaN;
    }

    o._apply = function(func, scale) {
        var scalar_functor = function(l) {
            if (typeof(l) == "number") return func(scale, l);
            return $.map(l, function(x) { return func(scale, x); });
        }
        var vector_functor = function(l) {
            // TODO: error handling?
            if (typeof(l) == "number") {
                return $.map(scale, function(x, i) { return func(x, l); });
            } else {
                return $.map(l, function(x, i) { return func(scale[i], x); });
            }
        }
        var variadic_functor = function(s) {
            return (typeof(s) == "number") ? scalar_functor : vector_functor;
        }
        if (arguments.length < 3)
            return variadic_functor(scale);
        // var accum = (scale.slice) ? scale.slice() : scale;
        for (var i = 2; i < arguments.length; ++i) {
            // scale = accum;
            scale = variadic_functor(scale)(arguments[i]);
        }
        return scale;
    };

    o._mul = function(){ return o._apply.apply(null, 
        [js.op['*']].concat(Array.prototype.slice.call(arguments, 0))) }
    o._add = function(){ return o._apply.apply(null, 
        [js.op['+']].concat(Array.prototype.slice.call(arguments, 0))) }
    o._div = function(){ return o._apply.apply(null, 
        [js.op['/']].concat(Array.prototype.slice.call(arguments, 0))) }
    o._sub = function(){ return o._apply.apply(null, 
        [js.op['-']].concat(Array.prototype.slice.call(arguments, 0))) }
    o._inv = function(l){ return l.map(function(x){ return 1/x; }) }
    o._min = function(){ return o._apply.apply(null, 
        [Math.min].concat(Array.prototype.slice.call(arguments, 0))) }
    o._max = function(){ return o._apply.apply(null, 
        [Math.max].concat(Array.prototype.slice.call(arguments, 0))) }

    // Linear interpolation
    // Return a value that is alpha (scalar) of the way between old_val
    // and new_val.  The values can be numbers or equal-length vectors.
    o._lerp = function(alpha, old_val, new_val) {
        if (typeof(old_val) == "number") {
            return alpha * new_val + (1 - alpha) * old_val;
        } else {
            return o._apply(function(old_val, new_val) {
                return alpha * new_val + (1 - alpha) * old_val;
            }, old_val)(new_val);
        }
    };

    // returns list of intervals in x- and y- dimensions which bound the input 
    // points exactly
    o.points_rect = function(ps){
        var f = [[Infinity, -Infinity], [Infinity, -Infinity]]
        ps.map(function(p){
            f[0][0] = Math.min(f[0][0], p[0])
            f[0][1] = Math.max(f[0][1], p[0])
            f[1][0] = Math.min(f[1][0], p[1])
            f[1][1] = Math.max(f[1][1], p[1])
        })
        return f
    }

    // Returns the nonnegative (nonoverlapping) distance btw two intervals.
    o.interval_dist = function(a, b) {
        var c = [a[1] - b[0], a[0] - b[1]];
        if (c[0] * c[1] <= 0)
            return 0;
        return Math.min(Math.abs(c[0]), Math.abs(c[1]));
    };

    o.dist = function(a, b) {
        if (b) return o.interval_size([a,b])
        return o.interval_size(a)
    }
    o.interval_size = function(i) { return Math.abs(i[1] - i[0]); };
    // Returns the least interval containing both inputs
    o.interval_bounds = function(a, b) {
        return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
    };
    // Force x into the interval [a, b]
    // a can also be passed as an interval and b left undefined
    o.interval_constrain = function(x, a, b) {
        if (b == undefined) {
            b = a[a.length - 1];
            a = a[0];
        }
        return Math.min(b, Math.max(a, x));
    };

    // returns the array of the nth element of every member array
    o.nth = function(array, n) {
        return array.map(function(x) { return x[n] })
    }
    o.max = function(array){
        return Math.max.apply(Math, array);
    };
    o.min = function(array){
        return Math.min.apply(Math, array);
    };

    // Useful for default values when using interval_bounds
    o.null_interval = [Infinity, -Infinity];
    o.all_interval = [-Infinity, Infinity];
    ////////
    o.bounding_rect2intervals = function(bounds) {
        return [[bounds.left, bounds.right],
            [bounds.top, bounds.bottom]]
    }
    ////////

    o.stack_readable = function(depth) {
        if (depth === undefined) depth = 1
        try {
            floopdeboopschnitzelburgenheimerror
        } catch (e) {
            var line = e.stack.split("\n")[depth + 1].match(/(?:at )([^ ]+) \((.*)\)/)
                , fn_name = line[1], fn_url = line[2]
            // The following line abbreviates the URL but makes it unclickable
            // in dev tools
            // fn_url = fn_url.replace(/(https?:)?(\/\/[^/]*\/)?/,"/")
            // console.log(fn_url + " (" + fn_name + "): " + text)
            return fn_url + " (" + fn_name + "): "
        }
        return "<stack unavailable> "
    }

    // Set a handler on the body DOM
    o.global_handler = function(name, handler) {
        var bodyEle = $("body").get(0);
        if(bodyEle.addEventListener) {
            bodyEle.addEventListener(name, handler, true);
        } else if(bodyEle.attachEvent) {
            var _handler = handler
            handler = function(){
                var event = window.event;
                _handler(event)
            };
            document.attachEvent("on" + name, handler)
        }
        return handler
    }
    o.global_handler_off = function(name, handler) {
        var bodyEle = $("body").get(0);
        if(bodyEle.removeEventListener) {
           bodyEle.removeEventListener(name, handler, true);
        } else if(bodyEle.detachEvent) {
           document.detachEvent("on" + name, handler);
        }
    }

    // undefer an element which was defered using stringjay "defer"
    o.undefer = function(el) {
        var $el = $(el)
        if (! $el.length) return $()
        var $new_el = $($el.data("content"))
        $el.replaceWith($new_el)
        return $new_el
    }
    o.unlazy = function($container) {
        var $defers = $container.find(".defer[data-content]")
        $.map($defers, function(el) {
            o.undefer($(el))
        })
        var $lazies = $container.find("img[data-lazy-src]")
        $.map($lazies, function(el) {
            var $img = $(el)
                ,url = $img.data("lazy-src")
            $img.removeAttr("data-lazy-src")
            var $img2 = $img.clone()
            $img2.lazy_load(url).insertAfter($img)
        })
    }

    o.all_assets = function() { return assets; }
    o.asset = function(name){
        return _asset(name) || "Not-found:" + name;
    };
    var _asset = function(name){
        if (assets[name])
            return assets[name];
        return false;
    };
    o.asset_name_from_url = function(url){
        var asset_name = 
            url.replace(/^(https?:)?(\/\/)?[^\/]+\/(lib\/)?/,"");
        // Remove the cache-busting 8-char hex
        asset_name = asset_name.replace(/\.[0-9a-z]{8}$/,"")
        if (_asset(asset_name))
            return asset_name;
        return false;
    }
    o.urlize = function(url) {
        if (url.match(/^http(s)?:\/\//))
            return url
        if (url.match(/^\/\//))
            return window.location.protocol + url
        throw "bad URL"
        window.location.protocol + "//" + url
    }

    o.val = function(x) {
        if (typeof(x) == "number")
            return x;
        else if (typeof(x) == "string")
            return parseFloat(x) || 0;
        else
            return 0;
    }
    o.defalt = function (x, def) {
        return (typeof(x) == "undefined") ? def : x
    }
    o.starts_with = function(haystack, needle) {
        return haystack.substr(0, needle.length) == needle;
    }

    o.mobile = function() {
        return (navigator.userAgent.match(/Android/i)
            || navigator.userAgent.match(/webOS/i)
            || navigator.userAgent.match(/iPhone/i)
            || navigator.userAgent.match(/iPad/i)
            || navigator.userAgent.match(/iPod/i)
            || navigator.userAgent.match(/BlackBerry/i)
            || navigator.userAgent.match(/Windows Phone/i));
    };

    // Can extend jquery functions with custom behavior.
    o.extend_jquery = function() {
    };
    o.extend_jquery();

    // Convert 2-vector into css for absolute div
    o.array2css = function(a) {
        return { left: a[0], top: a[1] }
    }
    // For performance-critical ops, do not use jquery style
    var css_style = function(el, styles) {
        $(el).css(styles)
    }
    var inline_style = function(el, styles) {
        var el_style = el.style
        $.each(styles, function(style_name, style_val) {
            el_style[style_name] = style_val
        })
    }
    var inline_style_px = function(el, styles) {
        var el_style = el.style
        $.each(styles, function(style_name, style_val) {
            el_style[style_name] = style_val + 'px'
        })
    }
    o.inline_style = 
        navigator.userAgent.match(/Mozilla/) ? css_style : inline_style
    o.inline_style_px = 
        navigator.userAgent.match(/Mozilla/) ? css_style : inline_style_px

    o.hoverable = function(el){
        if(el.prop('src')) {
            el.data('src', el.prop('src'));
            el.data('src_hover', hover_url(el.prop('src')));
            el.data('hover_showhide', function(showhide) { 
                new_src = el.data(showhide ? 'src_hover' : 'src');
                if (new_src) el.attr('src', new_src) 
            });
            el.mouseenter(function() {el.data('hover_showhide')(true)}).
                mouseout(function() {el.data('hover_showhide')(false)});
        }
        el.mouseenter(function() {
            if(o.hoverable.disabled) return;
            $(this).addClass('active');
        }).mouseleave(function() {
            if(!$(this).data('busy')) $(this).removeClass('active');
        });

        function hover_url(url) {
            var orig_asset = o.asset_name_from_url(url.replace("-hover", ""))
            var missing_asset = !orig_asset
            orig_asset = orig_asset || url;
            var h = orig_asset.replace(/(.png)|(-\w*)$/, '-hover.png');
            if (missing_asset)
                h = _asset(h) || h
            else
                h = _asset(h)
            var old = $("#dynamic_group img").filter(function(e){
                return $(this).attr("src") == h
            })
            if (old.length == 0 && h) {
                var i = $("<img style='display:none'>").attr('src', h);
                $("#dynamic_group").append(i);
            }
            return h;
        }
    };

    return o;
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
        for(var p in opts.data) {
            $("<input type='hidden'>").attr('name', p).attr('value', opts.data[p]).appendTo(form);
        }
        form.appendTo(document.body);
        // It's a mystery why this timout is needed to make the upload dialog appear on some machines
        if (opts.input_click) setTimeout(function() { input.click(); }, 50);
        return form;
    }

    // TODO-compat: may be useful for browsers that don't do XHR right
    // function asyncSubmit(form, callback, opts) {
    //     var opts = $.extend({ dataType : 'text' }, opts);
    //     var url = opts.url || $(form).attr('action') || server_url;
    //     $.post(url, $(form).serialize(), callback, opts.dataType);
    //     return false;
    // }

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
    //     if (url_params.loadDialog) {
    //         action = dialog_actions[url_params.loadDialog];
    //         if (action) {
    //             action();
    //         } else {
    //             loadDialog("?dialog=" + url_params.loadDialog);
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
