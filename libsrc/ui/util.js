define([
    'browser/jquery',
    'json!ui/routes.json',
    'ui/controller'
], function($, ApiRoutes, controller){
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

    main.wrapLinks = function() {
        // If we don't support pushState, fall back on default link behavior.
        if (!window.history && window.history.pushState) return;
        $('body').on('click', '[data-route-name]', function(e) {
            var anchor = $(e.target).closest('[data-route-name]'),
                route_name = anchor.attr('data-route-name'),
                route_obj = ApiRoutes[route_name],
                page_state = {
                    page: anchor.attr('href'),
                    api: anchor.attr('data-api-path'),
                    method: route_obj.client_method
                }
            ;
            e.preventDefault();
            navToRoute(page_state);
            return false;
        });

        // TODO: Bind this event with jquery?
        window.onpopstate = function(e) {
            if (!e.state) return;
            renderRoute(e.state);
        };

        function fetchRouteData(page_state, callback) {
            var callback = callback || function(){};
            api_call = {
                method: 'get',
                url: page_state.api.toString(),
                dataType: 'json',
                success: function(data) {
                    controller[page_state.method](data);
                    callback();
                }
            };
            $.ajax(api_call);
        }

        function navToRoute(page_state) {
            renderRoute(page_state, function() {
                history.pushState(page_state, null, page_state.page);
            });
        }

        function renderRoute(page_state, callback) {
            if (!callback) callback = function(){};
            fetchRouteData(page_state, callback);
        }
    };

    return main;
});

// TODO: massive cleanup of all below
(function(){

    /*** puts alt attribute of input fields in to value attribute, clears
     * it when focused.
     * Adds hover events for elements with class='hoverable'
     * ***/
    $(function () {

        // Cause external links and forms to open in a new window
        update_targets();

        if (! Modernizr.touch) {
            $(window).resize(function(){
                place_apps();
            });
        }
        place_apps();

        dialog_actions = {
            comments: function(){ $('#comment_btn').click(); }
            , email_invites: function(){ $('#hive_menu .email_invites').click(); }
        };
        if (urlParams.loadDialog) {
            action = dialog_actions[urlParams.loadDialog];
            if (action) {
                action();
            } else {
                loadDialog("?dialog=" + urlParams.loadDialog);
            }
        }

        if( dialog_to_show ){ showDialog(dialog_to_show.name, dialog_to_show.opts); };
        if (new_fb_connect) {
            _gaq.push(['_trackEvent', 'fb_connect', 'connected']);
            showDialog('#dia_fb_connect_landing');
        };

        var dia_referral = $('#dia_referral');
        dia_referral.find('input[type=submit]').click(function(){
            asyncSubmit(dia_referral.find('form'), function(){
                dia_referral.find('.btn_dialog_close').click();
                showDialog('#dia_sent_invites_thanks');
            });
            return false;
        });
    });
    $(window).load(function(){setTimeout(place_apps, 10)}); // position background
        
    var urlParams = {};
    (function () {
        var d = function (s) { return s ? decodeURIComponent(s.replace(/\+/, " ")) : null; }
        if(window.location.search) $.each(window.location.search.substring(1).split('&'), function(i, v) {
            var pair = v.split('=');
            urlParams[d(pair[0])] = d(pair[1]);
        });
    })();

    function update_targets(){
        $('a, form').each(link_target);
    }
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