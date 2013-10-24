/* Expression
  Defines the behavior of the expression frame.
  Expression interacts with its parent frame, the main site,
    via postMessage.
*/
define([
    'browser/jquery',
    'server/context',
    'browser/layout',
    'ui/jplayer',
    'browser/jquery/jplayer/skin',
    'browser/jquery/rotate.js'
], function($, context, layout, jplayer){
    if (typeof Hive == "undefined") Hive = {};

    Hive.Page = (function(){
        var o = {};
        o.initialized = false;

        var last_message = '';
        o.send_top = function(msg){
            if(last_message == msg) return;
            window.parent.postMessage(msg, '*');
            last_message = msg;
        };
        
        o.paging_sent = false;
        o.page = function(direction){
            if(o.paging_sent) return;
            o.paging_sent = true;
            o.send_top(direction);
        };
        o.page_next = function(){ o.page('next') },
        o.page_prev = function(){ o.page('prev') };

        // o.layout_parent = function(){
        //     o.send_top('layout=' + $(window).width() + ',' + $(window).height());
        // };

        o.init = function(){
            var no_embed = ("no-embed" in context.query);
            if (no_embed) 
                o.hide();
            else
                o.show();
            window.addEventListener('message', function(m){
                if ( m.data.action == "show" ) {
                    function callback(data){
                        $('body').html(data);
                        setTimeout(o.show, 0);
                    };
                    if (m.data.password && !$('body').children().length){
                        $.post('', { password: m.data.password, partial: true }, callback);
                    } else {
                        o.showshow();
                    }
                }
                if ( m.data.action == "hide" ) o.hidehide();
            }, false);
            $(document).mousemove(check_hover);
            $(document).click(expr_click);
            // $(document).mouseleave(function(e) { window.setTimeout(clear_hover, 600, e); });
            $(window).resize(layout.place_apps)
                 .click(function(){ o.send_top('focus'); });
        };

        o.margin = function () {
            return $(window).width() / 4;
        }
        var expr_click = function (e) {
            o.send_top("expr_click");
        }
        var clear_hover = function (e) {
            o.send_top("hide_prev"); // $('#page_prev').hidehide();
            o.send_top("hide_next"); // $('#page_next').hidehide();
        }
        var check_hover = function (e) {
            if (e.clientX < o.margin()) {
                o.send_top("show_prev"); //$('#page_prev').showshow();
            } else if (e.clientX > $(window).width() - o.margin()) {
                o.send_top("show_next"); //$('#page_next').showshow();
            } else {
                o.send_top("hide"); // $('#page_prev').hidehide();
            }
        }

        o.init_content = function(){
            // bonus paging and scrolling features
            // TODO: prevent scroll sticking after mouse-up outside of expr frame
            // TODO: figure out how to attach to all elements that don't have default drag behavior
            // TODO: make work in FF
            var scroll_ref, mouse_ref;
            if (0) {
                $('#bg').on('dragstart', function(e, dd){
                    scroll_ref = [document.body.scrollLeft, document.body.scrollTop];
                    mouse_ref = [e.clientX, e.clientY];
                }).on('drag', function(e, dd){
                    document.body.scrollLeft = scroll_ref[0] - e.clientX + mouse_ref[0];
                    document.body.scrollTop = scroll_ref[1] - e.clientY + mouse_ref[1];
                });
            }
            //$(document.body).on('keydown', function(e){
            //    if(e.keyCode == 32) // space
            //        if(document.body.scrollTop + $(window).height() == document.body.scrollHeight) o.page_next();
            //    if(e.keyCode == 39) // right arrow
            //        if(document.body.scrollLeft + $(window).width() == document.body.scrollWidth) o.page_next();
            //    if(e.keyCode == 37)
            //        if(document.body.scrollLeft == 0) o.page_prev();
            //});

            jplayer.init_jplayer();
        };

        o.show = function(){
            o.paging_sent = false;
            // if(!Hive.expr) return;

            if( ! o.initialized ){
                o.initialized = true;
                o.init_content();
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

            o.update_targets();
        };
        o.hide = function(){
            $('.hive_html').each(function(i, div) {
                var $div = $(div);
                if ($div.html() == '') return;
                $div.attr('data-content',$div.html());
                $div.html('');
            });
            $('.hive_audio .jp-jplayer').each(function(i, div) {
                $(div).jPlayer("pause");
            });
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
    
        return o;
    })();
    
    return {
        'initExpression': function() {
            layout.place_apps();
            $(Hive.Page.init);
            Hive.Page.show();
        }
    };
});
