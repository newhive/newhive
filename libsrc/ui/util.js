/*** puts alt attribute of input fields in to value attribute, clears
 * it when focused.
 * Adds hover events for elements with class='hoverable'
 * ***/
$(function () {
  $(".hoverable").each(function() { hover_add(this) });

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

function hover_url(url) {
    var h = url.replace(/(.png)|(-\w*)$/, '-hover.png');
    var i = $("<img style='display:none'>").attr('src', h);
    $(document.body).append(i);
    return h;
}

function hover_add(o) {
    if(o.src) {
        o.src_d = o.src;
        o.src_h = hover_url(o.src_d);
        $(o).mouseenter(function() { o.src = o.src_h }).
            mouseleave(function() { if(!o.busy) o.src = o.src_d });
    }
    $(o).mouseenter(function() {
            if(hover_add.disabled) return;
            $(this).addClass('active');
        })
        .mouseleave(function() { if(!this.busy) $(this).removeClass('active'); });
}

hover_menu = function(handle, drawer, options) {
    var handle = $(handle), drawer = $(drawer), o = { handle : handle, drawer : drawer },
        menu_items = drawer.find('.menu_item'), close_timer = false,
        opts = $.extend({
             open: noop
            ,close: noop
            ,open_menu: function(){ drawer.show() }
            ,close_menu: function(){ drawer.hide() }
            ,sticky: false

            // auto_close should be deprecated, it's never set to true in our project @2012-08-12
            ,auto_close: false

            // auto_close_delay is the amount of time after which the menu
            // closes on its own if the user doesn't trigger open or close
            // through any mouse action, assuming `opened` is set to true
            ,auto_close_delay: 0

            ,hover_close: true
            ,open_delay: 100
            ,close_delay: 500
            ,offset_y: 8
            ,offset_x: 8
            ,focus_persist: true
            ,hover: true
            ,open_condition: function(){ return true; }
            ,close_condition: function(){ return true; }
            ,auto_height: true
            ,default_item: drawer.find('.menu_item.default')
            ,layout: 'bottom'
            ,layout_x: 'auto'
            ,min_y: 0
            ,group: hover_menu
            ,animate_close: false
            ,animate_open: false
            ,opened: false
        }, options)
    ;
    if(!handle.length) throw("hover_menu has no handle");
    if(!drawer.length) throw("hover_menu has no drawer");
    if(!opts.group) opts.group = { menus: [] };

    o.menus = [];
    o.opened = opts.opened;
    o.sticky = opts.sticky;

    o.delayed_close = function(close_delay) {
            if(typeof(close_delay) != 'number') close_delay = false;
        opts.default_item.removeClass('active');
        if(opts.hover_close && ! close_timer) {
            close_timer = setTimeout(o.close, close_delay || opts.close_delay);
        }
        if(opts.group.delayed_close) opts.group.delayed_close();
    };
    o.cancel_close = function(e) {
        if(close_timer) {
            clearTimeout(close_timer);
            close_timer = false;
        }
    };

    // for debugging
    o.opts = function(){ return opts };
    o.drawer = function(){ return drawer };

    o.close = function(force) {
        if (!opts.close_condition()) return;
        close_timer = false;
        if(!o.opened) return;

        if(force) $.map(o.menus, function(m){ m.close(force) });
        else if(o.sticky || $.inArray(true, $.map(o.menus, function(m){ return m.opened })) > -1) return;

        if(opts.animate_close){
            if(!opts.animate_open){
                opts.animate_open = {};
                for(var p in opts.animate_close) opts.animate_open[p] = drawer.css(p);
            }
            drawer.animate(opts.animate_close, 100);
        } else opts.close_menu();
        if(o.shield) o.shield.remove();

        o.opened = false;
        opts.close();
        handle.get(0).busy = false;
        handle.removeClass('active');

        return o;
    }

    o.open = function() {
        if(hover_menu.disabled || ! opts.open_condition()) return;
        handle.addClass('active');
        opts.default_item.addClass('active');
        o.cancel_close();
        if(o.opened) return;

        o.opened = true;
        if( opts.group.current && (opts.group.current != o) ) opts.group.current.close(true);
        opts.group.current = o;
        handle.get(0).busy = true;

        if(opts.animate_open) drawer.animate(opts.animate_open, 100);
        else opts.open_menu();

        var css_opts = {};
        if(opts.layout){
            // pick top of menu based on if menu would go past bottom of
            // window if below handle, or above top of window if above the handle
            var hp = handle.parent().is(drawer.parent()) ? handle.position() : handle.offset();

            if( opts.layout == 'bottom' ){
                var oy = handle.outerHeight() + opts.offset_y;
                css_opts.top = (handle.offset().top + oy + drawer.outerHeight() > ($(window).height() + window.scrollY))
                    && (handle.offset().top - oy - drawer.outerHeight() - window.scrollY > 0) ?
                    hp.top - drawer.outerHeight() - opts.offset_y : hp.top + oy;

                var layout_x = opts.layout_x;
                if( layout_x == 'auto' ) {
                    var drawer_right = handle.offset().left + drawer.outerWidth();
                    var window_right = $(window).width() + window.scrollX;
                    layout_x = (drawer_right > window_right) ? 'right' : 'left';
                }
                css_opts.left = ( layout_x == 'right' ?
                    hp.left - drawer.outerWidth() + handle.outerWidth() : hp.left );
            }
            else if( opts.layout == 'center_y' ){
                css_opts.top = Math.max(opts.min_y, hp.top + handle.outerHeight() / 2 -
                     drawer.outerHeight() / 2);
                css_opts.left = hp.left - opts.offset_x - drawer.outerWidth();
            }

            // shield element prevents hovering over gap between handle and menu from closing the menu
            o.shield = $();
            //if(opts.offset_y) o.shield.add($('<div>').css({
            //    'position': 'absolute',
            //    'left': hp.left,
            //    'top': hp.top + handle.outerHeight(),
            //    'width': handle.outerWidth(),
            //    'height': opts.offset_y,
            //    'background-color': 'orange'
            //});
            //if(opts.offset_x) o.shield.add($('<div>').css({
            //    'position': 'absolute',
            //    'left': hp.left - opts.offset_x,
            //    'top': hp.top,
            //    'width': opts.offset_x,
            //    'height': handle.outerHeight(),
            //    'background-color': 'orange'
            //});
            o.shield.insertBefore(handle)
                .mouseover(o.cancel_close)
                .mouseout(o.delayed_close)
            ;
        }

        if(opts.auto_height && css_opts.top + drawer.outerHeight() > $(window).height()) {
            var scroller = drawer.find('.items');
            scroller.css('max-height', $(window).height() - 50 - css_opts.top -
                (drawer.outerHeight() - scroller.outerHeight()));
        }

        drawer.css(css_opts);

        opts.open();
        return o;
    }

    opts.group.menus.push(o);

    if(opts.hover) {
        handle.on('hover', null, { delay: opts.open_delay }, o.open)
            .on('hoverend', o.delayed_close);
        drawer.mouseover(o.cancel_close).mouseout(o.delayed_close);
    }
    handle.click(function(){
        if(o.opened && opts.default_item) opts.default_item.click();
        o.open();
    });
    if(opts.focus_persist){
        drawer.find('input[type=text],input[type=password],textarea').on('click keydown', function(){
            o.sticky = true;
        }).on('blur', function(){
            o.sticky = false;
            o.delayed_close();
        }).on('focus', o.cancel_close);
        drawer.mousedown(function(){ setTimeout(o.cancel_close, 1) });
    }

    menu_items.each(function(i, d){
        var e = $(d);
        e.mouseover(function(){ e.addClass('active'); });
        e.mouseout(function(){ e.removeClass('active'); });
    });

    if(opts.auto_close) drawer.click(o.close);
    if(opts.opened && opts.auto_close_delay){ o.delayed_close(opts.auto_close_delay); }

    return o;
}
hover_menu.menus = [];


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


function new_window(b,c,d){var a=function(){if(!window.open(b,'t','scrollbars=yes,toolbar=0,resizable=1,status=0,width='+c+',height='+d)){document.location.href=b}};if(/Firefox/.test(navigator.userAgent)){setTimeout(a,0)}else{a()}};
