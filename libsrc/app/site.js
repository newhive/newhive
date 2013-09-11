// dummy module for cram build system
define(['curl'], function(curl){
    curl({
        baseUrl: 'libsrc',
        pluginPath: 'curl/plugin',
        packages: {
            'curl': 'curl'
        },
        excludes: ['browser/jquery']
    });
    curl(['ui/controller']);
});
