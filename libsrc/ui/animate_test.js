a = 0;
exprs = $('iframe.expr');
$('#exprs').css('perspective', '400px');

animate = function(f){
    f.animate = true;
    var fr = function(){
        f();
        if(f.animate) requestAnimationFrame(fr)
    };
    fr()
}

before = (new Date()).getTime();

radius = - exprs.length * 1050 / (2*Math.PI);

spin = function(){
    var now = (new Date()).getTime();
    a = a + (now - before) * 0.03;
    before = now;
    exprs.each(function(i, el){
        var an = a + i*360/exprs.length;
        el = $(el);
        el.css('transform',
              'rotatey(' + an +'deg)'
            + 'translate3d(0px, 0px, ' + radius + 'px)'
        );
        el.css({left:0, top: 0});
    });
}

animate(spin);