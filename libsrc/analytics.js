Hive.AB_Test = {
    tests: [],
    ga_string: function(){
        var map_function = function(el){
            if (el.active) return el.id + el.chosen_case_id;
        };
        return $.map(Hive.AB_Test.tests, map_function).join(',');
    },
    add_test: function(opts){
        // Required options (oxymoron I know, but named arguments are easier to work with than positional)
        //   id:
        //     short name used for cookie name and google analytics variable.
        //     conventionally 3 characters all caps, e.g. `NAV`
        //   start_date:
        //     javascript Date object
        //   duration:
        //     number of days to run test
        //   cases:
        //     mapping of test cases of the form {caseID: definition}. caseID can be any
        //     short alphanumeric, but is conventionally an integer (this goes in
        //     the cookie and GA variable). See "Case definition" below
        //
        // Optional options (haha)
        //   name:
        //     descriptive string describing the test
        //   auto_weight:
        //     if set to true each test case has an equal probability of being chosen
        //   logged_in_case:
        //     value matching the caseID mapping to the case that should be
        //     used for logged in users
        //   logged_out_only:
        //     if set to true the test will only apply to logged out users.
        //     cookie and GA variable will not be set for logged in users
        //
        // Case definition
        //   Each case is defined as an object literal with the following attributes
        //     config_override:
        //       function to update config document, gets called after test case is chosen
        //       e.g. function(){ Hive.config.frame.nav.hideable = true; }
        //     weight:
        //       weighted probability of this case being chose. optional if `auto_weight` is true
        //       these probabilities get normalized, so can really be any number
        //     name:
        //       optional descriptive string describing this case

        var o = $.extend({}, opts);
        var cookie_name = "AB_" + o.id;
        // Stop execution if the current time is not in the test time range
        o.end_date = new Date(o.start_date.getTime() + o.duration * 24 * 3600 * 1000);
        var now = Date.now();
        if (o.start_date > now || o.end_date < now) return;

        // Register the test with Hive.AB_Test, used to set GA variables
        Hive.AB_Test.tests.push(o);

        // this function ensures that the sum of weights of cases = 1
        function normalize_weights(){
            var total = 0;
            $.each(o.cases, function(i, test_case){
                total += o.auto_weight ? 1 : test_case.weight;
            });
            $.each(o.cases, function(i, test_case){
                var weight = o.auto_weight ? 1 : test_case.weight;
                test_case.weight = weight / total;
            });
        };

        function pick_random_case(){
            normalize_weights();
            var rand = Math.random();
            var current = 0;
            var chosen_id;
            $.each(o.cases, function(i, test_case){
                if (typeof(chosen_id) != "undefined") return;
                current = current + test_case.weight;
                if (current > rand) {
                    chosen_id = i;
                }
            });
            return chosen_id;
        };

        function assign_group(id){
            o.chosen_case = o.cases[id];
            o.chosen_case_id = id;
            createCookie(cookie_name, id, o.end_date)
        };

        if (opts.logged_out_only && logged_in){
            o.active = false;
            return o;
        } else {
            o.active = true;
        }

        // Use case specified in querystring (for debugging), else use case for
        // logged in user if set, else case defined in cookie if set, else pick
        // a random case. Can't just use || with assignment because case_id
        // could be 0
        var case_id = URI(window.location.href).query(true)[cookie_name];
        if (!case_id && case_id !== 0 && logged_in) case_id = o.logged_in_case;
        if (!case_id && case_id !== 0) case_id = readCookie(cookie_name);
        if (!case_id && case_id !== 0) case_id = pick_random_case();
        assign_group(case_id);

        o.chosen_case.config_override();

        return o;
    }
};