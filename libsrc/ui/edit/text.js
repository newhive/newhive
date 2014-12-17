define([
    'browser/jquery'

    ,'./env'
    ,'./apps'
    ,'./util'
    ,'./events'

    ,'js!google_closure.js'
], function(
    $

    ,env
    ,hive_app
    ,u
    ,evs
){

var Text = o = {};

// var is_chrome = navigator.userAgent.toLowerCase().indexOf('chrome') > -1;
o.Text = function(o) {
    hive_app.App.has_resize(o);
    // hive_app.App.has_resize_h(o);
    hive_app.App.has_opacity(o);
    hive_app.App.has_shield(o, {auto: false});
    // for now, having internal and external alignment is too weird.
    // o.has_align = false;  

    // When this app is multiselected, have color act on all foreground text
    o.color = function() { return o.div.find("font").css("color") }
    o.color_set = function(v) { 
        // o.div.find("font").css("color", v)
        o.rte.makeEditable()
        o.rte.focusAndPlaceCursorAtStart()
        document.execCommand('selectAll');
        o.rte.exec_command('+foreColor', v) 
        o.rte.focusAndPlaceCursorAtStart()
    }

    o.get_aspect = function() {
        var dims = o.dims();
        return dims[0] / dims[1];
    };
    var content = o.init_state.content;
    o.content = function(content) {
        if(typeof(content) != 'undefined') {
            // avoid 0-height content element in FF
            if(content == null || content == '') o.rte.setHtml(false, '&nbsp;');
            else o.rte.setHtml(false, content);
        } else {
            // remove any remaining selection-saving carets
            o.rte.content_element.find('span[id^="goog_"]').remove();
            return o.rte.getCleanContents();
        }
    }

    var edit_mode = false;
    o.edit_mode = function(mode) {
        if (mode === edit_mode) return;
        if (mode) {
            o.unshield();
            o.rte.remove_breaks();
            o.rte.makeEditable();
            o.rte.restore_cursor();
            o.content_element
                .on('mousedown keydown', function(e){ e.stopPropagation(); });
            edit_mode = true;
        }
        else {
            o.rte.unwrap_all_selections();
            o.rte.save_cursor();
            o.rte.add_breaks();
            o.rte.make_uneditable();
            o.content_element
                .off('mousedown keydown')
                .trigger('blur');
            edit_mode = false;
            o.shield();
        }
    }

    o.focus.add(function(){
        o.refresh_size();
        o.edit_mode(true);
        o.div.removeClass('drag')
    });
    o.unfocus.add(function(){
        o.edit_mode(false);
        o.div.addClass('drag')
    });

    o.link = function(){
        return o.rte.get_link(); }
    o.link_set = function(v){
        o.rte.make_link(v) }

    o.calcWidth = function() {
        return o.content_element.width();
    }
    o.calcHeight = function() {
        return o.content_element.height();
    }

    o.refresh_size = function() {
        // o.resize_h([o.calcWidth(), o.dims()[1]]);
        o.dims_set([o.calcWidth(), o.calcHeight()]);
        if (env.Selection.selected(o)) 
            env.Selection.update_relative_coords();
    };

    hive_app.has_scale(o);
    var _layout = o.layout;
    o.layout = function(){
        _layout();
        o.div.css('font-size', (env.scale() * o.scale()) + 'em');
    };

    // New scaling code
    var scale_ref, dims_ref, history_point;
    o.before_resize = function(coords){
        scale_ref = o.scale();
        dims_ref = o.dims();
        o.fixed_aspect = (coords[1] != 0)
    }
    o.after_resize = function() {
        scale_ref = dims_ref = undefined;
        o.refresh_size();
        o.fixed_aspect = false
    }
    var _dims_relative_set = o.dims_relative_set;
    o.dims_relative_set = function(dims) {
        var old_dims = o.dims_relative();
        _dims_relative_set(dims);
        if (!o.initialized) return;
        if (dims[1] == old_dims[1]) {
            // Horizontal resize limited by content element.
            dims = dims.slice();
            dims[0] = Math.max(dims[0], o.calcWidth() / env.scale());
            _dims_relative_set(dims);
            return;
        }

        if (!dims_ref) return
        var new_scale = scale_ref * o.dims()[0] / dims_ref[0];
        o.scale_set(new_scale);

        // should not scale for resize_h
        // new_scale = o.scale() * o.dims_relative()[0] / old_dims[0];
    }
    
    var _load = o.load;
    o.load = function() {
        o.scale_set(o.scale());
        o.content(content);
        _load();
        o.refresh_size();
    };

    o.history_saver = function(){
        var exec_cmd = function(cmd){ return function(){
            var uneditable = o.rte.isUneditable();
            if(uneditable) o.rte.makeEditable();
            o.rte.exec_command(cmd);
            if(uneditable) o.rte.makeUneditable();
            o.rte.unwrap_all_selections();
        } };
        env.History.save(exec_cmd('+undo'), exec_cmd('+redo'), 'edit');
    };

    function controls(o) {
        var d = o.div;
        // These controls can only ever apply to a single app.
        if (!o.single()) return
        var app = o.app.sel_app();

        o.addControls($('#controls_text'));

        var link_open = function(){
            var link = app.rte.get_link();
        }
        o.link_menu = o.append_link_picker(d.find('.buttons'),
                        {open: link_open, field_to_focus: app.content_element
                            ,height: 45});

        var cmd_buttons = function(query, func) {
            $(query).each(function(i, e) {
                $(e).click(function() { func($(e).attr('val')) });
            })
        }

        o.hover_menu(d.find('.button.fontname'), d.find('.drawer.fontname'));

        o.color_picker = u.append_color_picker(
            d.find('.drawer.color'),
            function(v) {
                app.rte.exec_command('+foreColor', v);
            },
            undefined,
            {field_to_focus: app.content_element, iframe: true}
        );
        o.color_menu = o.hover_menu(
            d.find('.button.color'),
            d.find('.drawer.color'),
            {
                auto_close : false,
                open: function(){
                    // Update current color. Range should usually exist, but
                    // better to do nothing than throw error if not
                    var range = app.rte.getRange();
                    if (range){
                        var current_color = $(app.rte.getRange().getContainerElement()).css('color');
                        o.color_picker.set_color(current_color);
                    }
                },
            }
        );

        o.align_menu = o.hover_menu(d.find('.button.align'), d.find('.drawer.align'));

        o.close_menus = function() {
            o.link_menu.close();
            o.color_menu.close();
        }

        $('.option[cmd],.button[cmd]').each(function(i, el) {
            $(el).on('mousedown', function(e) {
                e.preventDefault();
            }).click(function(){
                app.rte.exec_command($(el).attr('cmd'), $(el).attr('val'));
            });
        });

        return o;
    }
    o.make_controls.push(controls);

    o.div.addClass('text');
    if(!o.init_state.dimensions) o.dims_set([ 300, 20 ]);
    o.content_element = $("<div class='content'>")
    o.content_element.attr('id', u.random_str())
    o.div.append(o.content_element);
    o.rte = new Text.goog_rte(o.content_element, o);
    goog.events.listen(o.rte.undo_redo.undoManager_,
            goog.editor.plugins.UndoRedoManager.EventType.STATE_ADDED,
            o.history_saver);
    goog.events.listen(o.rte, goog.editor.Field.EventType.DELAYEDCHANGE, o.refresh_size);
    o.shield();

    setTimeout(function(){ o.load(); }, 100);
    return o;
}
hive_app.registerApp(o.Text, 'hive.text');

o.goog_rte = function(content_element, app){
    var that = this;
    var id = content_element.attr('id');
    this.content_element = content_element;
    this.app = app;

    // API link here please
    goog.editor.SeamlessField.call(this, id);

    this.make_uneditable = function() {
        // Firefox tries to style the entire content_element, which google
        // clobbers with makeUneditable.  This solution works, but results
        // in multiple nested empty divs in some cases. TODO: improve
        that.content_element.css('opacity', ''); //Opacity isn't supported for text anyway yet
        var style = that.content_element.attr('style');
        if (style != '') {
            var inner_wrapper = $('<div></div>');
            inner_wrapper.attr('style', style);
            that.content_element.wrapInner(inner_wrapper[0]);
        }
        that.makeUneditable();
    };

    function rangeIntersectsNode(range, node) {
        var nodeRange = node.ownerDocument.createRange();
        try {
          nodeRange.selectNode(node);
        }
        catch (e) {
          nodeRange.selectNodeContents(node);
        }

        return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) == -1 &&
               range.compareBoundaryPoints(Range.START_TO_END, nodeRange) == 1;
    }

    this.select = function(range) {
        var s = window.getSelection();
        if(!s) return;
        s.removeAllRanges();
        if(range)
        s.addRange(range);
        return s;
    }

    this.get_range = function() {
        var s = window.getSelection();
        if(s.rangeCount) return window.getSelection().getRangeAt(0).cloneRange();
        else return null;
    }

    // Finds link element the cursor is on, selects it after saving
    // any existing selection, returns its href
    this.get_link = function() {
        // If the color menu is still open the selection needs to be restored.
        // TODO: make this work right :)
        if (saved_range) that.restore_selection();

        that.range = that.get_range();
        if (!that.range) return
        var r = that.range.cloneRange(); // save existing selection

        // Look for link in parents
        var node = r.startContainer;
        while(node.parentNode) {
            node = node.parentNode;
            if (node == that.content_element) return;
            if($(node).is('a')) {
                r.selectNode(node);   
                that.select(r);
                return $(node).attr('href');
            }
        }

        // Look for the first link that intersects r
        var find_intersecting = function(r) {
            var link = false;
            $(document).find('a').each(function() {
                if(!link && rangeIntersectsNode(r, this)) link = this;
            });
            if(link) {
                r.selectNode(link);
                that.select(r);
                return $(link).attr('href');
            };
            return '';
        }
        var link = find_intersecting(r);
        if(link) return link;

        // If there's still no link, select current word
        if(!r.toString()) {
            // select current word
            // r.expand('word') // works in IE and Chrome
            var s = that.select(r);
            // If the cursor is not at the beginning of a word...
            if(!r.startContainer.data || !/\W|^$/.test(
                r.startContainer.data.charAt(r.startOffset - 1))
            ) s.modify('move','backward','word');
            s.modify('extend','forward','word');
        }

        // It's possible to grab a previously missed link with the above code 
        var link = find_intersecting(that.get_range());
        return link;
    }

    this.make_link = function(href) {
        // TODO: don't use browser API directly
        if (href === ''){
            document.execCommand('unlink', false);
        } else {
            document.execCommand('createlink', false, href);
        }
    };

    var saved_range;
    this.save_selection = function(){
        var range = this.getRange();
        saved_range = range.saveUsingCarets();
    };

    this.restore_selection = function(){
        if (!saved_range || saved_range.isDisposed()) return false;
        saved_range.restore();
        saved_range = false;
        return true;
    };

    // Wrap a node around selecte text, even if selection spans multiple block elements
    var current_selection;
    this.wrap_selection = function(wrapper){
        if (current_selection) return;
        wrapper = wrapper || '<span class="hive_selection"></span>';
        var range, node, nodes;

        // Turn wrapper into DOM object
        if (typeof(wrapper) == "string") wrapper = $(wrapper)[0];

        // Get selection
        range = that.getRange();
        if (!range) return;

        if (range.getStartNode() === range.getEndNode()) {
            // Return if selection is empty
            if (range.getStartOffset() === range.getEndOffset()) return;

            // Check if selection is already a link
            var node = $(range.getStartNode());
            if (node.parent().is('a')) nodes = node.parent();
        }

        that.save_selection();
        range.select(); // For some reason on FF save_selection unselects the range
        if (!nodes){
            // Create temporary anchor nodes using execcommand
            document.execCommand('createLink', false, 'temporary_link');

            // Replace temporary nodes with desired wrapper, saving reference in
            // closure for use by unwrap_selection
            nodes = $(range.getContainer()).find('a[href=temporary_link]');
        }
        current_selection = nodes.wrapInner(wrapper)
        current_selection = current_selection.children()
        current_selection = current_selection.unwrap();

        // Remove browser selection
        window.getSelection().removeAllRanges();
        return current_selection;
    };
    this.unwrap_selection = function(){
        if (! current_selection) return;
        current_selection.each(function(i,el){ $(el).replaceWith($(el).html()); });
        that.restore_selection();
        current_selection = false;
    };
    this.unwrap_all_selections = function(){
        var selection =  that.content_element.find('.hive_selection');
        if (selection.length) {
            current_selection = selection;
            that.unwrap_selection();
        }
    };

    this.undo_redo = new goog.editor.plugins.UndoRedo();
    this.basic_text = new goog.editor.plugins.BasicTextFormatter();
    this.registerPlugin(this.undo_redo);
    this.registerPlugin(this.basic_text);
    this.registerPlugin(new goog.editor.plugins.RemoveFormatting());

    var previous_range = {};
    this.content_element.on('paste', function(){
        setTimeout(function(){
            that.strip_sizes();

            // Unformat all text, google RTE doesn't have selectAll so we use browser
            document.execCommand('selectAll');
            that.execCommand('+removeFormat');
        }, 0);

        // Paste unformatting code
        //    var current_range = that.getRange();
        //    var pasted_range = goog.dom.Range.createFromNodes(
        //        previous_range.before.getStartNode(), 
        //        previous_range.before.getStartOffset(), 
        //        current_range.getStartNode(), 
        //        current_range.getStartOffset()
        //        );
        //    pasted_range.select();
        //    that.execCommand('+removeFormat');

        //    // Place cursor at end of pasted range
        //    var range = that.getRange();
        //    previous_range.before = goog.dom.Range.createFromNodes(
        //        range.getEndNode(), 
        //        range.getEndOffset(), 
        //        range.getEndNode(), 
        //        range.getEndOffset()
        //        );
        //    previous_range.before.select();
        //}, 0);
    });

    var range_change_callback = function(type){
        return function(){
            var range = that.getRange();
            $.each(type, function(i, name){
                previous_range[name] = range;
            });
        }
    };

    this.exec_command = function(cmd, val){
        that.execCommand(cmd, val);
        that.strip_sizes();
    };

    this.strip_sizes = function(){
        that.content_element.find('*').css('font-size', '');
        //    .css('width', '').css('height', '')
        //    .attr('width', '').attr('height', '');
    };


    goog.events.listen(this, goog.editor.Field.EventType.DELAYEDCHANGE, range_change_callback(['delayed']));
    goog.events.listen(this, goog.editor.Field.EventType.BEFORECHANGE, range_change_callback(['before']));
    goog.events.listen(this, goog.editor.Field.EventType.SELECTIONCHANGE, range_change_callback(['delayed', 'before']));
    //goog.events.listen(this, goog.editor.Field.EventType.FOCUS, range_change_callback(['before']));

    var saved_cursor;
    this.save_cursor = function(){
        saved_cursor = previous_range.delayed.saveUsingCarets();
    };
    this.restore_cursor = function(){
        if (saved_cursor){
            that.focus();
            saved_cursor.restore();
            return true;
        } else {
            that.focusAndPlaceCursorAtStart();
            return false;
        };
    };
    //goog.events.listen(this, goog.editor.Field.EventType.LOAD, this.restore_cursor);

    // Text wrapping hack: insert explicit line breaks where text is
    // soft-wrapped before saving, remove them on loading
    this.add_breaks = function(){
        var text_content = that.content_element;

        // Get text nodes: .find gets all non-textNode elements, contents gets
        // all child nodes (inc textNodes) and the not() part removes all
        // non-textNodes. Technique by Nathan MacInnes, nathan@macinn.es from
        // http://stackoverflow.com/questions/4671713/#7431801
         var textNodes = text_content.find('*').add(text_content).contents()
            .not(text_content.find('*'));

        // Split each textNode into individual textNodes, one for each word
        textNodes.each(function (index, lastNode) {
            var startOfWord = /\W\b/,
                result;
            while (startOfWord.exec(lastNode.nodeValue) !== null) {
                result = startOfWord.exec(lastNode.nodeValue);
                // startOfWord matches the character before the start of a
                // word, so need to add 1.
                lastNode = lastNode.splitText(result.index + 1);
            }
        });
        // end contributed code

        var textNodes = text_content.find('*').add(text_content).contents()
            .not(text_content.find('*'));

        textNodes.wrap('<span class="wordmark">');

        // iterate over wordmarks, add <br>s where line breaks occur
        var y = 0;
        text_content.find('.wordmark').each(function(i, e) {
            var ely = $(e).offset().top;
            if($(e).text().length && ely > y) {
                var br = $('<br class="softbr">');
                $(e).before(br);
                if(ely != $(e).offset().top){
                    br.remove(); // if element moves, oops, remove <br>
                }
            }
            y = ely;
        });

        // unwrap all words
        text_content.find('.wordmark').each(function(i, e) {
            $(e).replaceWith($(e).text());
        });

        var html = text_content.wrapInner($("<span class='viewstyle' style='white-space:nowrap'>")).html();
        return html;
    }
    this.remove_breaks = function() {
        that.content_element.find('.softbr').remove();
        var wrapper = that.content_element.find('.viewstyle');
        if(wrapper.length) that.content_element.html(wrapper.html());
    }
}
goog.editor.Field.DELAYED_CHANGE_FREQUENCY = 100;
goog.inherits(o.goog_rte, goog.editor.SeamlessField);

return o;

});
