if (typeof(Hive) == "undefined") Hive = {};

Hive.config = {
    frame: {
        auto_close_delay: 5000,
        close_delay: 1100,
        open_delay: 500,
        speed: 300,
        nav: {
            open_initially: true,
            hideable: false,
            opens_navigator: false
        },
        navigator: {
            open_initially: false,
            hideable: true,
            opens_nav: false
        }
    }
}

// See Hive.AB_test definition in util.js for explanation of options
//Hive.AB_Test.add_test({
//    name: 'nav/navigator initially open or closed'
//    , id: 'NAV'
//    , auto_weight: true
//    , config_doc: Hive.config.frame
//    , start_date: new Date(2012,7,12) // Remember months are 0-indexed
//    , duration: 7
//    , logged_in_case: 1
//    , cases: {
//        0: {
//            name: 'open initially'
//            , config_overrides: {open_initially: true}
//        }, 
//        1: {
//            name: 'closed_initially'
//            , config_overrides: {open_initially: false, auto_close_delay: 5000}
//        }
//    }
//});

//Hive.AB_Test.add_test({
//    name: 'nav/navigator initially open or closed'
//    , id: 'NAVB'
//    , auto_weight: true
//    , start_date: new Date(2012,7,18) // Remember months are 0-indexed
//    , duration: 7
//    , cases: {
//        0: {
//            name: 'hideable'
//            , config_override: function(){
//                Hive.config.frame.nav.hideable = true;
//            }
//        }, 
//        1: {
//            name: 'not hideable'
//            , config_override: noop
//        }
//    }
//});

_gaq.push(['_setCustomVar', 4, 'AB_javascript', Hive.AB_Test.ga_string()]);
_gaq.push(['_trackPageview']);
