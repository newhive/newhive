define(['browser/layout',
        'browser/jquery',
        'server/context'], function(layout, $, context) {
    if (typeof Hive == "undefined") Hive = {};

    Hive.Page = (function(){
        var o = {};
        o.initialized = false;

        o.send_top = function(msg){
            window.parent.postMessage(msg, '*');
        };
        
        o.paging_sent = false;
        o.page = function(direction){
            if(o.paging_sent) return;
            o.paging_sent = true;
            o.send_top(direction);
        };
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

            //$(document.body).on('keydown', function(e){
            //    if(e.keyCode == 32) // space
            //        if(document.body.scrollTop + $(window).height() == document.body.scrollHeight) o.page_next();
            //    if(e.keyCode == 39) // right arrow
            //        if(document.body.scrollLeft + $(window).width() == document.body.scrollWidth) o.page_next();
            //    if(e.keyCode == 37)
            //        if(document.body.scrollLeft == 0) o.page_prev();
            //});

            o.init_jplayer();
        };

        o.show = function(){
            o.paging_sent = false;
            if(!Hive.expr) return;

            if( ! o.initialized ){
                o.initialized = true;
                // o.init_content();
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

            // update_targets();
            o.layout_parent();
        };
        o.hide = function(){
            $('.hive_html').each(function(i, div) {
                var $div = $(div);
                $div.attr('data-content',$div.html());
                $div.html('');
            });
        };

        return o;
    })();
    
    return {
        'initExpression': function() {
            $(Hive.Page.init);
            Hive.Page.show();
            // layout.place_apps();
        }
    };
});