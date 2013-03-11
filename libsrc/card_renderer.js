define(['text/mustache',
        'mustache!templates/card_master.html',
        'mustache!templates/expr_card.html',
        'mustache!templates/feed_card.html',
        'mustache!templates/user_card.html'],
    function(Mustache,masterCardTempl, exprCardTempl, feedCardTempl, userCardTempl) {
        var partials = {
            'expr_card': exprCardTempl,
            'feed_card': feedCardTempl,
            'user_card': userCardTempl,
        };
        for (var partialName in partials) {
            Mustache.compilePartial(partialName, partials[partialName]);
        }
        var compiledMaster = Mustache.compile(masterCardTempl);
        // TODO: Separate this from jquery code
        return function() {
            return {
                renderCards: function(CARDS_JSON) {
                    for (var cardIdx = 0; cardIdx < CARDS_JSON.length; cardIdx++) {
                        var renderedHTML = compiledMaster(CARDS_JSON[cardIdx]);
                        $('#feed .feed-content').append($(renderedHTML));
                    }
                }
            };
        }
});
