if (typeof(Hive) == "undefined") Hive = {};

Hive.config = {
    frame: {
        open_initially: true,
        auto_close_delay: 5000
    }
}

// See Hive.AB_test definition in util.js for explanation of options
Hive.AB_Test.add_test({
    name: 'nav/navigator initially open or closed'
    , id: 'NAV'
    , auto_weight: true
    , config_doc: Hive.config.frame
    , start_date: new Date(2012,7,12) // Remember months are 0-indexed
    , duration: 7
    , logged_in_case: 1
    , cases: {
        0: {
            name: 'open initially'
            , config_overrides: {open_initially: true}
        }, 
        1: {
            name: 'closed_initially'
            , config_overrides: {open_initially: false, auto_close_delay: 5000}
        }
    }
});

_gaq.push(['_setCustomVar', 4, 'AB_javascript', Hive.AB_Test.ga_string()]);
_gaq.push(['_trackPageview']);
