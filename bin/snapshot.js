// usage: phantomjs snapshot.js URL OUTPUT_IMG X_DIM Y_DIM DELAY
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
})

//page.onInitialized = function(){
//    page.evaluate(function(){
//        var create = document.createElement
//        document.createElement = function(tag){
//            var elem = create.call(document, tag)
//            if(tag === "video"){
//                elem.canPlayType = function(){ return "probably" }
//            }
//            return elem
//        }
//        
//        window.navigator.plugins = { "Shockwave Flash": { description: "Shockwave Flash 11.2 e202" } }
//        window.navigator.mimeTypes = { "application/x-shockwave-flash": { enabledPlugin: true } }
//    })
//}
