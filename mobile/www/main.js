var config = {
     owner: 'zach'
    ,search: '@abram #simple'
    ,search_url: 'http://staging.newhive.com/api/search'
    ,content_url: 'http://staging.tnh.me/'
}

var frames = [], page_index = 0, cards = [], current_page, next_page

var init = function(){
    $.getJSON(config.search_url, {q: config.search}, function(data){
        cards = data.cards
        render_index()  
        // urls = data.cards.map(function(c){
        //     return config.content_url + c.id
        // })
        // current_page = get_page(0)
        // load_next()
    })
    // window.addEventListener('message', page_receive, false)
    // TODO-feature: implement scrolling / swiping page-throughs
    // window.addEventListener('scroll', scroll)

    document.addEventListener('deviceready', function(){
        document.addEventListener('backbutton', back)
    })
    bind_click('#overlays .prev', back)

    // TODO: implement share_menu
    // bind_click('#overlays .share', share_menu.open)
}

function content_url(i){
    return config.content_url + cards[i].id;
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

function get_page(i){
    return $("<iframe class='full'>")
        .prop('src', content_url(i) + '?viewport=500x500')
        .appendTo('#content')
}

function load_next(){
    // console.log('loading next')
    // next_page = get_page((page_index + 1) % urls.length).addClass('next').show()
}

function render_index(){
    $('#content').removeClass('expr').addClass('cards').empty()
    $('#overlays').hide()

    var  tmpl = $('#templates .expr_card').clone()
        ,new_cards = document.createDocumentFragment()
    cards.map(function(card, i){
        card_el = tmpl.clone()
        card_el.find('.title').html(card.title)
        if(card.snapshot_small)
        card_el.find('img').attr('src', 'http://' + card.snapshot_small)
        if(config.owner != card.owner.name){
            card_el.find('.byline').html('by ' + card.owner.name)
        }
        bind_click(card_el, function(){ render_expr(i) })
        new_cards.appendChild(card_el[0])
    })
    $('#content').append(new_cards)
}

function render_expr(i){
    $('#content').removeClass('cards').addClass('expr').empty()
    $('#overlays').show()
    get_page(i)
}

function back(){
    render_index()
}

function bind_click(el, func){
    // binding click somehow fires events on elements that haven't been rendered yet
    // $(el).on('click', func).on('touchend', func)
    $(el).on('touchend', func)
}