define([], function(){
    var base_url = 'http://wirbu.office.newhive.com:1212'
    return {
         app: true
        ,owner: 'root' // skips byline on cards with this username
        ,search_url: base_url + '/api/profile/cat/root/featured'
        ,search_query: ''
        ,content_url: 'http://wirbu.office.tnh.me/'
        ,base_url: base_url
        // ,search_url: 'http://staging.newhive.com/api/search?' +
        //     $.param({q: '@zach'})
    }
})