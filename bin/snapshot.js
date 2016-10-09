var page = require('webpage').create(),
    sys = require('system'),
    delay = parseInt(sys.args[5])

console.log(sys.args[1])
page.viewportSize = { width: parseInt(sys.args[3]), height: parseInt(sys.args[3]) }

function render(){
    page.render(sys.args[2])
    console.log('done')
    phantom.exit(0)
}

page.onConsoleMessage = function(v){
    console.log(v)
}

page.onLoadFinished = function(){
    setTimeout(render, delay)
}

page.open(sys.args[1], function(stat){
    console.log(page, stat)
});
