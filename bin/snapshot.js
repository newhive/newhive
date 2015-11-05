var page = require('webpage').create(),
    sys = require('system')

page.onLoadFinished = function(){
    page.evaluate(function(){
        setTimeout(function(){ console.log('rendering') }, 6000)
    })
}
page.onConsoleMessage = function(v){
    console.log(v)
    page.render(sys.args[2])
    console.log('done')
    phantom.exit(0)
}

console.log(sys.args[1])
page.viewportSize = { width: parseInt(sys.args[3]), height: parseInt(sys.args[3]) }
page.open(sys.args[1], function(stat){
    console.log(page, stat)
});

