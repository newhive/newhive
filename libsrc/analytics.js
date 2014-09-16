define([
    'context'
], function(
    context
){
    var o = {}

    o.setup = function() {
        // review analytics data at google.com:
        // https://www.google.com/analytics/web/
        window._gaq = [];
        _gaq.push(['_setAccount', 'UA-22827299-2']);
        _gaq.push(['_setDomainName', context.config.server_domain]);
        _gaq.push(['_setAllowLinker', true]);
        _gaq.push(['_setCampaignTrack', true]);
        if(context.user){
            _gaq.push(['_setCustomVar', 1, 'username', context.user.name, 1]);
            _gaq.push(['_setCustomVar', 2, 'join_date', "" + context.user.created, 1]);
        }
        
        // ?? What is this?
        // nd['signup_group']
        // Out[7]: 1
        // _gaq.push(['_setCustomVar', 3, 'groups', '{{user.groups_to_string()}}', 1]);

        // ?? where did ga_commands live?
        // {% for command in ga_commands %}
        // _gaq.push({{ command | json }});
        // {% endfor %}

        // ?? Pageview now handled in config.js after custom var set
        //_gaq.push(['_trackPageview']);

        if (context.config.use_ga || 1) {
            (function() {
              var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
              ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
              var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
            })();
        }
    }

    o.track_pageview = function(route_name) {
        _gaq.push(['_trackPageview']);
    }

    return o
})
