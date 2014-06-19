config.content_url = 'http://staging.tnh.me/'

var view = 'index', page_index = 0, cards = [], cards_complete = false,
    cards_loading = false, current_page, next_page, win = $(window)

var init = function(){
    render_page_index()
    fetch_cards()

    // window.addEventListener('message', page_receive, false)
    // TODO-feature: implement scrolling / swiping page-throughs
    // window.addEventListener('scroll', scroll)

    document.addEventListener('deviceready', function(){
        document.addEventListener('backbutton', back)
    })
    bind_click('#overlays .prev', back)

    // TODO: implement share_menu
    // bind_click('#overlays .share', share_menu.open)

    window.onorientationchange = function(){
        var landscape = win.width() > win.height()
        $('#content').toggleClass('landscape', landscape)
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
    return $("<iframe class='full'>")
        .prop('src', content_url(card) + '?viewport=500x500')
        .appendTo('#content')
}

function load_next(){
    // console.log('loading next')
    // next_page = get_page((page_index + 1) % urls.length).addClass('next').show()
}

function page_exit(){
    window.onscroll = false
}

function render_page_index(){
    $('#content').removeClass(view).addClass('index').empty()
    $('#overlays').hide()
    view = 'index'
    render_cards(cards)

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
    page_exit()
    $('#content').removeClass(view).addClass('expr').empty()
    $('#overlays').show()
    view = 'expr'

    get_page(card)
}

function back(){
    render_page_index()
}

function bind_click(el, func){
    // binding click somehow fires events on elements that haven't been rendered yet
    // $(el).on('click', func).on('touchend', func)
    $(el).on('touchend', func)
}