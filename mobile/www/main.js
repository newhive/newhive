config.content_url = 'http://staging.tnh.me/'

var view = 'index', page_index = 0, cards = [], cards_complete = false,
    cards_loading = false, current_page, next_page, win = $(window),
    page_index_scrollY = 0

var init = function(){
    // zoom level is current-width / device-width
    var  ideal_width = document.documentElement.clientWidth
        ,initial_scale = ideal_width / 500
    $('meta[name=viewport]').attr('content', 'user-scalable=1, width=500, '
        + 'initial-scale=' + initial_scale)
        // +', minimum-scale=.2, maximum-scale=10')
    render_page_index()
    fetch_cards()

    // window.addEventListener('message', page_receive, false)
    // TODO-feature: implement scrolling / swiping page-throughs
    // window.addEventListener('scroll', scroll)

    document.addEventListener('deviceready', function(){
        document.addEventListener('backbutton', back)

        StatusBar.styleDefault()
        StatusBar.backgroundColorByName('white')
        StatusBar.overlaysWebView(false)
    })

    window.onorientationchange = function(){
        var landscape = win.width() > win.height()
        $('body').toggleClass('landscape', landscape)
    }
}

function content_url(card){
    return config.content_url + card.id;
}

function page_receive(ev){
    // var msg = ev.data

    // if(msg == 'next')
    //     page_next()
    // else if(msg == 'prev')
    //     page_prev()
}

function page_next(){
    // if(!next_page) console.log('not loaded')
    // var old_page = current_page
    // page_index = (page_index + 1) % urls.length
    // current_page = next_page.removeClass('next').show()
    // next_page = false
    // load_next()
    // old_page.remove()
    // delete old_page
}

// function page_prev(){
//   get_page(page_index).hide()

//   page_index = page_index - 1
//   if(page_index == -1) page_index = urls.length - 1

//   get_page(page_index).show()
// }

function get_page(card){
    return $("<iframe>")
        .prop('src', content_url(card) + '?viewport=500x500')
        .appendTo('#content')
}

function load_next(){
    // console.log('loading next')
    // next_page = get_page((page_index + 1) % urls.length).addClass('next').show()
}

function page_exit(){
    window.onscroll = false
    $('#overlays').empty()
}

function render_page_index(){
    page_exit()
    $('#content').removeClass(view).addClass('index').empty()
    view = 'index'
    if(window.StatusBar) StatusBar.show()
    render_cards(cards)
    window.scrollTo(0, page_index_scrollY)

    window.onscroll = function(ev){
        if(!cards_loading && (win.scrollTop() + win.height() + 100
            > document.body.scrollHeight) && !cards_complete
        ){
            fetch_cards()
        }
    }
}
function fetch_cards(){
    cards_loading = true
    $.getJSON(config.search_url, { at: cards.length }, function(data){
        var new_cards = data.cards
        if(!new_cards.length){
            cards_complete = true
            cards_loading = false
            return
        }
        // TODO-perf: cache card data and snapshot imgs in local storage
        cards = cards.concat(new_cards)
        render_cards(new_cards)
        cards_loading = false
    })
}
function render_cards(cards){
    if(!cards.length) return

    var  tmpl = $('#templates .expr_card').clone()
        ,new_cards = document.createDocumentFragment()
    cards.map(function(card){
        card_el = tmpl.clone()
        card_el.find('.title').html(card.title)
        if(card.snapshot_small)
        card_el.find('img').attr('src', 'http://' + card.snapshot_small)
        if(config.owner != card.owner.name){
            card_el.find('.byline').html('by ' + card.owner.name)
        }
        bind_click(card_el, function(){ render_page_expr(card) })
        new_cards.appendChild(card_el[0])
    })
    $('.spinner').remove()
    if(!cards_complete)
        new_cards.appendChild(
            $("<div class='spinner expr_card'><div class='fg'></div>")[0])
    $('#content').append(new_cards)
}

function render_page_expr(card){
    page_index_scrollY = window.scrollY
    page_exit()
    StatusBar.hide()
    $('#content').removeClass(view).addClass('expr').empty()
    view = 'expr'
    $('#overlays').append($('#templates .expr_overlays').clone().children())
    button('.icon.prev', back)
    button('.share', function(){ share_expr(card) })
    // TODO: implement share_menu
    // bind_click('#overlays .share', share_menu.open)

    var frame_el = get_page(card)
    window.scrollTo(0)
    setTimeout(function(){ frame_el.addClass('expr') }, 100)
}

function back(){
    render_page_index()
}

function bind_click(el, func){
    // binding click somehow fires events on elements that haven't been rendered yet
    // $(el).on('click', func).on('touchend', func)
    // $(el).on('touchend', func)
    $(el).on('tap', func)
}

function button(sel, click){
    $(sel).on('tapstart', function(){
        $(this).addClass('hover')
    }).on('tapend', function(){
        $(this).removeClass('hover')
    }).on('tap', click)
}

// TODO: implement multitouch?
// function button(sel, click){
//     var jq = $(sel), hover_el, hovering = false
//     $(jq).on('touchstart', function(){
//         var hover_el = this, hover_jq = $(hover_el)
//         hovering = true
//         hover_jq.addClass('hover').on('touchmove', function(ev){
//             var tch = ev.originalEvent.touches[0],
//                 x = tch.clientX, y = tch.clientY,
//                 over = document.elementFromPoint(x, y)
//             if(over == hover_el || $.contains(hover_el, over)){
//                 if(!hovering){
//                     hover_jq.addClass('hover')
//                     hovering = true
//                 }
//             }else{
//                 hover_jq.removeClass('hover')
//                 hovering = false
//             }
//             // android needs this, otherwise next touchmove isn't fired
//             ev.preventDefault()
//         })
//     }).on('touchend', function(){
//         if(hovering) click()
//     })
// }

function share_expr(card){
    window.plugins.socialsharing.share('', // message
        'Check out this NewHive page', card.snapshot_big, card.url)
}