define(['mustache!templates/expr_card.html'], function(exprCardTempl) {
    return function() {
        return {
            renderCards: function(CARDS_JSON) {
                for (var cardIdx = 0; cardIdx < CARDS_JSON.length; cardIdx++) {
                    var renderedHTML = exprCardTempl(CARDS_JSON[cardIdx]);
                    $('#feed .feed-content').append($(renderedHTML));
                }
            }
        };
    }
});
