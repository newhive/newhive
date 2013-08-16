// dummy module for cram build system
define(['curl'], function(curl){
    curl.config({ //config);
        baseUrl: '/lib/libsrc',
        pluginPath: 'curl/plugin'
    });
    curl(['ui/controller'], function(controller){
        // pass
    });
});