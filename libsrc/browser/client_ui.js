define(['card_renderer','js!browser/zepto'], function(_cardRenderer) {
    var cardRenderer = _cardRenderer();
    
    const lookupTable = {
        "/api/psawaya/profile/expressions/public" : {
            "title" : 'Network',
            "api_route": '/api/profile/network'
        }
    };
    return function() {
        return {
            wrapLinks: function() {
                $('body').on('click', '[data-load-route]', function(e) {
                   var newRoute = e.target.getAttribute('data-load-route');
                   alert('you clicked on a wrapped link, didn\'t you? ' + newRoute);
                   $.ajax({
                       method: 'get',
                       url: newRoute.toString(),
                       dataType: 'json',
                       success: function(data) {
                           cardRenderer.renderCards(data);
                       }
                   })
                   e.preventDefault();
                   return false;
                });
            }
        };
    }
});