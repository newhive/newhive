define([
    'browser/jquery',
    'json!server/compiled.assets.json'
], function($, assets){
    var o = {};

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
        (function($){
            var jqShow = $.fn.show;
            $.fn.showshow = function( speed, easing, callback) {
                $(this).each(function(i, el) {
                    if ($(el).hasClass("hide"))
                        $(el).removeClass("hide");
                    // else
                    return jqShow.apply($(el), speed, easing, callback); 
                });
                return jqShow.apply($(this), speed, easing, callback);
            };
        }(jQuery));
        (function($){
            var jqHide = $.fn.hide;
            $.fn.hidehide = function( speed, easing, callback) {
                //if (elem.hasClass("hide"))
                // if (elem)
                    return $(this).addClass("hide");
                return jqHide(speed, easing, callback);
            };
        }(jQuery));
        (function($){
            $.fn.showhide = function( showhide ) {
                if (showhide) return $(this).showshow();
                else return $(this).hidehide();
            };
        }(jQuery));
        (function($){
            $.fn.addremoveClass = function( klass, addremove ) {
                if (addremove) return $(this).addClass(klass);
                else return $(this).removeClass(klass);
            };
        }(jQuery));
        (function($){
            $.fn.toggleshow = function( speed, easing, callback) {
                var elem = $(this);
                if (elem.hasClass("hide") || elem.css("display") == "none")
                    elem.showshow();
                else
                    elem.hidehide();
            };
        }(jQuery));
        // Send extra debug info to the server on every AJAX call
        var debug_ajax = function($) {
            var ajax = $.fn.ajax
                ,call_stack = printStackTrace().join('\n\n')
            $.fn.ajax = function() {
                ajax.apply(this, arguments)
            };
        };
        if (0) // to enable ajax debugging
            debug_ajax(jquery);
        (function($){
            // TODO: make menus aware of being disabled
            var wrapper_func = function( event_name, func ) {
                if (["click"].indexOf(event_name) == -1)
                    return func
                return function() {
                    if ($(this).hasClass("disabled")) 
                        return
                    return func.apply(this, arguments)
                }
            }
            $.fn.bind_once = function( event_name, func ) {
                return $(this).off(event_name, func).on(event_name, func);
            };
            $.fn.bind_once_anon = function( event_name, func ) {
                return $(this).off(event_name).on(event_name, func);
            };
        }(jQuery));
        /*
         * jQuery Easing v1.3 - http://gsgd.co.uk/sandbox/jquery/easing/
         *
         * Uses the built in easing capabilities added In jQuery 1.1
         * to offer multiple easing options
         *
         * TERMS OF USE - jQuery Easing
         * 
         * Open source under the BSD License. 
         * 
         * Copyright Â© 2008 George McGinley Smith
         * All rights reserved.
         * 
         * Redistribution and use in source and binary forms, with or without modification, 
         * are permitted provided that the following conditions are met:
         * 
         * Redistributions of source code must retain the above copyright notice, this list of 
         * conditions and the following disclaimer.
         * Redistributions in binary form must reproduce the above copyright notice, this list 
         * of conditions and the following disclaimer in the documentation and/or other materials 
         * provided with the distribution.
         * 
         * Neither the name of the author nor the names of contributors may be used to endorse 
         * or promote products derived from this software without specific prior written permission.
         * 
         * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
         * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
         * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
         *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
         *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
         *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
         * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
         *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
         * OF THE POSSIBILITY OF SUCH DAMAGE. 
         *
        */

        // t: current time, b: begInnIng value, c: change In value, d: duration
        jQuery.easing['jswing'] = jQuery.easing['swing'];

        jQuery.extend( jQuery.easing,
        {
            def: 'easeOutQuad',
            swing: function (x, t, b, c, d) {
                //alert(jQuery.easing.default);
                return jQuery.easing[jQuery.easing.def](x, t, b, c, d);
            },
            easeInQuad: function (x, t, b, c, d) {
                return c*(t/=d)*t + b;
            },
            easeOutQuad: function (x, t, b, c, d) {
                return -c *(t/=d)*(t-2) + b;
            },
            easeInOutQuad: function (x, t, b, c, d) {
                if ((t/=d/2) < 1) return c/2*t*t + b;
                return -c/2 * ((--t)*(t-2) - 1) + b;
            },
            easeInCubic: function (x, t, b, c, d) {
                return c*(t/=d)*t*t + b;
            },
            easeOutCubic: function (x, t, b, c, d) {
                return c*((t=t/d-1)*t*t + 1) + b;
            },
            easeInOutCubic: function (x, t, b, c, d) {
                if ((t/=d/2) < 1) return c/2*t*t*t + b;
                return c/2*((t-=2)*t*t + 2) + b;
            },
            easeInQuart: function (x, t, b, c, d) {
                return c*(t/=d)*t*t*t + b;
            },
            easeOutQuart: function (x, t, b, c, d) {
                return -c * ((t=t/d-1)*t*t*t - 1) + b;
            },
            easeInOutQuart: function (x, t, b, c, d) {
                if ((t/=d/2) < 1) return c/2*t*t*t*t + b;
                return -c/2 * ((t-=2)*t*t*t - 2) + b;
            },
            easeInQuint: function (x, t, b, c, d) {
                return c*(t/=d)*t*t*t*t + b;
            },
            easeOutQuint: function (x, t, b, c, d) {
                return c*((t=t/d-1)*t*t*t*t + 1) + b;
            },
            easeInOutQuint: function (x, t, b, c, d) {
                if ((t/=d/2) < 1) return c/2*t*t*t*t*t + b;
                return c/2*((t-=2)*t*t*t*t + 2) + b;
            },
            easeInSine: function (x, t, b, c, d) {
                return -c * Math.cos(t/d * (Math.PI/2)) + c + b;
            },
            easeOutSine: function (x, t, b, c, d) {
                return c * Math.sin(t/d * (Math.PI/2)) + b;
            },
            easeInOutSine: function (x, t, b, c, d) {
                return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
            },
            easeInExpo: function (x, t, b, c, d) {
                return (t==0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
            },
            easeOutExpo: function (x, t, b, c, d) {
                return (t==d) ? b+c : c * (-Math.pow(2, -10 * t/d) + 1) + b;
            },
            easeInOutExpo: function (x, t, b, c, d) {
                if (t==0) return b;
                if (t==d) return b+c;
                if ((t/=d/2) < 1) return c/2 * Math.pow(2, 10 * (t - 1)) + b;
                return c/2 * (-Math.pow(2, -10 * --t) + 2) + b;
            },
            easeInCirc: function (x, t, b, c, d) {
                return -c * (Math.sqrt(1 - (t/=d)*t) - 1) + b;
            },
            easeOutCirc: function (x, t, b, c, d) {
                return c * Math.sqrt(1 - (t=t/d-1)*t) + b;
            },
            easeInOutCirc: function (x, t, b, c, d) {
                if ((t/=d/2) < 1) return -c/2 * (Math.sqrt(1 - t*t) - 1) + b;
                return c/2 * (Math.sqrt(1 - (t-=2)*t) + 1) + b;
            },
            easeInElastic: function (x, t, b, c, d) {
                var s=1.70158;var p=0;var a=c;
                if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
                if (a < Math.abs(c)) { a=c; var s=p/4; }
                else var s = p/(2*Math.PI) * Math.asin (c/a);
                return -(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
            },
            easeOutElastic: function (x, t, b, c, d) {
                var s=1.70158;var p=0;var a=c;
                if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
                if (a < Math.abs(c)) { a=c; var s=p/4; }
                else var s = p/(2*Math.PI) * Math.asin (c/a);
                return a*Math.pow(2,-10*t) * Math.sin( (t*d-s)*(2*Math.PI)/p ) + c + b;
            },
            easeInOutElastic: function (x, t, b, c, d) {
                var s=1.70158;var p=0;var a=c;
                if (t==0) return b;  if ((t/=d/2)==2) return b+c;  if (!p) p=d*(.3*1.5);
                if (a < Math.abs(c)) { a=c; var s=p/4; }
                else var s = p/(2*Math.PI) * Math.asin (c/a);
                if (t < 1) return -.5*(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
                return a*Math.pow(2,-10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )*.5 + c + b;
            },
            easeInBack: function (x, t, b, c, d, s) {
                if (s == undefined) s = 1.70158;
                return c*(t/=d)*t*((s+1)*t - s) + b;
            },
            easeOutBack: function (x, t, b, c, d, s) {
                if (s == undefined) s = 1.70158;
                return c*((t=t/d-1)*t*((s+1)*t + s) + 1) + b;
            },
            easeInOutBack: function (x, t, b, c, d, s) {
                if (s == undefined) s = 1.70158; 
                if ((t/=d/2) < 1) return c/2*(t*t*(((s*=(1.525))+1)*t - s)) + b;
                return c/2*((t-=2)*t*(((s*=(1.525))+1)*t + s) + 2) + b;
            },
            easeInBounce: function (x, t, b, c, d) {
                return c - jQuery.easing.easeOutBounce (x, d-t, 0, c, d) + b;
            },
            easeOutBounce: function (x, t, b, c, d) {
                if ((t/=d) < (1/2.75)) {
                    return c*(7.5625*t*t) + b;
                } else if (t < (2/2.75)) {
                    return c*(7.5625*(t-=(1.5/2.75))*t + .75) + b;
                } else if (t < (2.5/2.75)) {
                    return c*(7.5625*(t-=(2.25/2.75))*t + .9375) + b;
                } else {
                    return c*(7.5625*(t-=(2.625/2.75))*t + .984375) + b;
                }
            },
            easeInOutBounce: function (x, t, b, c, d) {
                if (t < d/2) return jQuery.easing.easeInBounce (x, t*2, 0, c, d) * .5 + b;
                return jQuery.easing.easeOutBounce (x, t*2-d, 0, c, d) * .5 + c*.5 + b;
            }
        });

        /*
         *
         * TERMS OF USE - EASING EQUATIONS
         * 
         * Open source under the BSD License. 
         * 
         * Copyright Â© 2001 Robert Penner
         * All rights reserved.
         * 
         * Redistribution and use in source and binary forms, with or without modification, 
         * are permitted provided that the following conditions are met:
         * 
         * Redistributions of source code must retain the above copyright notice, this list of 
         * conditions and the following disclaimer.
         * Redistributions in binary form must reproduce the above copyright notice, this list 
         * of conditions and the following disclaimer in the documentation and/or other materials 
         * provided with the distribution.
         * 
         * Neither the name of the author nor the names of contributors may be used to endorse 
         * or promote products derived from this software without specific prior written permission.
         * 
         * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
         * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
         * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
         *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
         *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
         *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
         * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
         *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
         * OF THE POSSIBILITY OF SUCH DAMAGE. 
         *
         */
    };
    o.extend_jquery();

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
        }).mouseout(function() {
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