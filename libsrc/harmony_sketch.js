const REV = 6,
       BRUSHES = ["sketchy", "shaded", "chrome", "fur", "longfur", "web", "", "simple", "squares", "ribbon", "", "circles", "grid", 'eraser'],
       USER_AGENT = navigator.userAgent.toLowerCase();

var SCREEN_WIDTH = 1400, //window.innerWidth,
    SCREEN_HEIGHT = 875, //window.innerHeight,
    BRUSH_SIZE = 1,
    BRUSH_PRESSURE = 1,
    COLOR = [0, 0, 0],
    //BACKGROUND_COLOR = [250, 250, 250],
    //STORAGE = window.localStorage,
    brush,
    brush_name,
    //saveTimeOut,
    wacom,
    mouseX = 0,
    mouseY = 0,
    container,
    canvas,
    flattenCanvas,
    context,
    shiftKeyIsDown = false,
    altKeyIsDown = false;

function init()
{
    var embed;
    
    if (USER_AGENT.search("android") > -1 || USER_AGENT.search("iphone") > -1)
        BRUSH_SIZE = 2;	
        
    if (USER_AGENT.search("safari") > -1 && USER_AGENT.search("chrome") == -1) // Safari
        STORAGE = false;
    
    //document.body.style.backgroundRepeat = 'no-repeat';
    //document.body.style.backgroundPosition = 'center center';	
    
    container = document.createElement('div');
    document.body.appendChild(container);

    /*
     * TODO: In some browsers a naste "Plugin Missing" window appears and people is getting confused.
     * Disabling it until a better way to handle it appears.
     * 
     * embed = document.createElement('embed');
     * embed.id = 'wacom-plugin';
     * embed.type = 'application/x-wacom-tablet';
     * document.body.appendChild(embed);
     *
     * wacom = document.embeds["wacom-plugin"];
     */

    canvas = document.createElement("canvas");
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    canvas.style.cursor = 'crosshair';
    container.appendChild(canvas);
    
    context = canvas.getContext("2d");
    
    flattenCanvas = document.createElement("canvas");
    flattenCanvas.width = SCREEN_WIDTH;
    flattenCanvas.height = SCREEN_HEIGHT;
    
    if (!brush) set_brush('chrome');
    
    window.addEventListener('mousemove', onWindowMouseMove, false);
    window.addEventListener('keydown', onWindowKeyDown, false);
    window.addEventListener('keyup', onWindowKeyUp, false);
    window.addEventListener('blur', onWindowBlur, false);
    
    document.addEventListener('mouseout', onDocumentMouseOut, false);
    
    document.addEventListener("dragenter", onDocumentDragEnter, false);  
    document.addEventListener("dragover", onDocumentDragOver, false);
    //document.addEventListener("drop", onDocumentDrop, false);  
    
    canvas.addEventListener('mousedown', onCanvasMouseDown, false);
    canvas.addEventListener('touchstart', onCanvasTouchStart, false);
    
    return container;
}

function set_brush(name) {
    brush_name = name;
    if(brush) brush.destroy();
    brush = new window[name](context);
}
function get_brush() { return brush_name }

function get_image(src) {
    return canvas.toDataURL('image/png');
}
function set_image(src) {
    var img = new Image();
    img.addEventListener("load", function(event) {
        img.removeEventListener(event.type, arguments.callee, false);
        context.drawImage(img,0,0);
    }, false);
    img.src = src;			
}

function onWindowKeyDown( event )
{
    if (shiftKeyIsDown)
        return;
        
    switch(event.keyCode)
    {
        case 16: // Shift
            shiftKeyIsDown = true;
            break;
        case 18: // Alt
            altKeyIsDown = true;
            break;
        case 68: // d
            if(BRUSH_SIZE > 1) BRUSH_SIZE --;
            break;
        case 70: // f
            BRUSH_SIZE ++;
            break;			
    }
}

function onWindowKeyUp( event )
{
    switch(event.keyCode)
    {
        case 16: // Shift
            shiftKeyIsDown = false;
            break;
        case 18: // Alt
            altKeyIsDown = false;
            break;
        case 82: // r
            set_brush(brush_name);
            break;
        case 66: // b
            document.body.style.backgroundImage = null;
            break;
    }
    
    context.lineCap = BRUSH_SIZE == 1 ? 'butt' : 'round';	
}

function onWindowBlur( event )
{
    shiftKeyIsDown = false;
    altKeyIsDown = false;
}


// DOCUMENT

function onDocumentMouseOut( event )
{
    onCanvasMouseUp();
}

function onDocumentDragEnter( event )
{
    event.stopPropagation();
    event.preventDefault();
}

function onDocumentDragOver( event )
{
    event.stopPropagation();
    event.preventDefault();
}

function clear() {
    context.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
    set_brush(brush_name);
}


// CANVAS
function get_x(e) { return Math.round(e.clientX * (SCREEN_WIDTH / window.innerWidth)); }
function get_y(e) { return Math.round(e.clientY * (SCREEN_WIDTH / window.innerWidth)); }

function onWindowMouseMove(e) {
    mouseX = get_x(e);
    mouseY = get_y(e);
}

function onCanvasMouseDown( event )
{
    var data, position;

    //clearTimeout(saveTimeOut);
    cleanPopUps();
    
    if (altKeyIsDown)
    {
        flatten();
        
        data = flattenCanvas.getContext("2d").getImageData(0, 0, flattenCanvas.width, flattenCanvas.height).data;
        position = (get_x(event) + (get_y(event) * canvas.width)) * 4;
        
        COLOR = [ data[position], data[position + 1], data[position + 2] ];
        
        return;
    }
    
    BRUSH_PRESSURE = wacom && wacom.isWacom ? wacom.pressure : 1;
    
    brush.strokeStart(get_x(event), get_y(event));

    window.addEventListener('mousemove', onCanvasMouseMove, false);
    window.addEventListener('mouseup', onCanvasMouseUp, false);
}

function onCanvasMouseMove( event )
{
    BRUSH_PRESSURE = wacom && wacom.isWacom ? wacom.pressure : 1;
    
    brush.stroke(get_x(event), get_y(event));
}

function onCanvasMouseUp()
{
    brush.strokeEnd();
    
    window.removeEventListener('mousemove', onCanvasMouseMove, false);
    window.removeEventListener('mouseup', onCanvasMouseUp, false);
    
    //if (STORAGE)
    //{
    //    clearTimeout(saveTimeOut);
    //    saveTimeOut = setTimeout(saveToLocalStorage, 2000, true);
    //}
}


//

function onCanvasTouchStart( event )
{
    cleanPopUps();		

    if(event.touches.length == 1)
    {
        event.preventDefault();
        
        brush.strokeStart( event.touches[0].pageX, event.touches[0].pageY );
        
        window.addEventListener('touchmove', onCanvasTouchMove, false);
        window.addEventListener('touchend', onCanvasTouchEnd, false);
    }
}

function onCanvasTouchMove( event )
{
    if(event.touches.length == 1)
    {
        event.preventDefault();
        brush.stroke( event.touches[0].pageX, event.touches[0].pageY );
    }
}

function onCanvasTouchEnd( event )
{
    if(event.touches.length == 0)
    {
        event.preventDefault();
        
        brush.strokeEnd();

        window.removeEventListener('touchmove', onCanvasTouchMove, false);
        window.removeEventListener('touchend', onCanvasTouchEnd, false);
    }
}

function saveToLocalStorage()
{
    localStorage.canvas = canvas.toDataURL('image/jpeg');
}

function flatten()
{
    var context = flattenCanvas.getContext("2d");
    
    //context.fillStyle = 'rgb(' + BACKGROUND_COLOR[0] + ', ' + BACKGROUND_COLOR[1] + ', ' + BACKGROUND_COLOR[2] + ')';
    //context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(canvas, 0, 0);
}

function cleanPopUps()
{
}


function chrome( context )
{
    this.init( context );
}

chrome.prototype =
{
    context: null,

    prevMouseX: null, prevMouseY: null,

    points: null, count: null,

    init: function( context )
    {
        this.context = context;
        
        if (RegExp(" AppleWebKit/").test(navigator.userAgent))
            this.context.globalCompositeOperation = 'darker';

        this.points = new Array();
        this.count = 0;
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    stroke: function( mouseX, mouseY )
    {
        var i, dx, dy, d;
        
        this.points.push( [ mouseX, mouseY ] );
        
        this.context.lineWidth = BRUSH_SIZE;
        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.1 * BRUSH_PRESSURE + ")";
        this.context.beginPath();
        this.context.moveTo(this.prevMouseX, this.prevMouseY);
        this.context.lineTo(mouseX, mouseY);
        this.context.stroke();

        for (i = 0; i < this.points.length; i++)
        {
            dx = this.points[i][0] - this.points[this.count][0];
            dy = this.points[i][1] - this.points[this.count][1];
            d = dx * dx + dy * dy;

            if (d < 1000)
            {
                this.context.strokeStyle = "rgba(" + Math.floor(Math.random() * COLOR[0]) + ", " + Math.floor(Math.random() * COLOR[1]) + ", " + Math.floor(Math.random() * COLOR[2]) + ", " + 0.1 * BRUSH_PRESSURE + " )";
                this.context.beginPath();
                this.context.moveTo( this.points[this.count][0] + (dx * 0.2), this.points[this.count][1] + (dy * 0.2));
                this.context.lineTo( this.points[i][0] - (dx * 0.2), this.points[i][1] - (dy * 0.2));
                this.context.stroke();
            }
        }

        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;

        this.count ++;
    },

    strokeEnd: function()
    {
        
    }
}


function circles( context )
{
    this.init( context );
}

circles.prototype =
{
    context: null,

    prevMouseX: null, prevMouseY: null,

    count: null,

    init: function( context )
    {
        this.context = context;
        this.context.globalCompositeOperation = 'source-over';
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    stroke: function( mouseX, mouseY )
    {
        var i, dx, dy, d, cx, cy, steps, step_delta;

        this.context.lineWidth = BRUSH_SIZE;
        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.1 * BRUSH_PRESSURE + ")";	

        dx = mouseX - this.prevMouseX;
        dy = mouseY - this.prevMouseY;
        d = Math.sqrt(dx * dx + dy * dy) * 2;
        
        cx = Math.floor(mouseX / 100) * 100 + 50;
        cy = Math.floor(mouseY / 100) * 100 + 50;
        
        steps = Math.floor( Math.random() * 10 );
        step_delta = d / steps;

        for (i = 0; i < steps; i++)
        {
            this.context.beginPath();
            this.context.arc( cx, cy, (steps - i) * step_delta, 0, Math.PI*2, true);
            this.context.stroke();
        }

        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    strokeEnd: function()
    {
        
    }
}


function fur( context )
{
    this.init( context );
}

fur.prototype =
{
    context: null,

    prevMouseX: null, prevMouseY: null,

    points: null, count: null,

    init: function( context )
    {
        this.context = context;

        this.points = new Array();
        this.count = 0;
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    stroke: function( mouseX, mouseY )
    {
        var i, dx, dy, d;

        this.points.push( [ mouseX, mouseY ] );

        this.context.lineWidth = BRUSH_SIZE;
        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.1 * BRUSH_PRESSURE + ")";
        
        this.context.beginPath();
        this.context.moveTo(this.prevMouseX, this.prevMouseY);
        this.context.lineTo(mouseX, mouseY);
        this.context.stroke();

        for (i = 0; i < this.points.length; i++)
        {
            dx = this.points[i][0] - this.points[this.count][0];
            dy = this.points[i][1] - this.points[this.count][1];
            d = dx * dx + dy * dy;

            if (d < 2000 && Math.random() > d / 2000)
            {
                this.context.beginPath();
                this.context.moveTo( mouseX + (dx * 0.5), mouseY + (dy * 0.5));
                this.context.lineTo( mouseX - (dx * 0.5), mouseY - (dy * 0.5));
                this.context.stroke();
            }
        }

        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;

        this.count ++;
    },

    strokeEnd: function()
    {
        
    }
}


function grid( context )
{
    this.init( context );
}

grid.prototype =
{
    context: null,

    init: function( context )
    {
        this.context = context;

        if (RegExp(" AppleWebKit/").test(navigator.userAgent))
            this.context.globalCompositeOperation = 'darker';
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
    },

    stroke: function( mouseX, mouseY )
    {
        var i, cx, cy, dx, dy;
        
        cx = Math.round(mouseX / 100) * 100;
        cy = Math.round(mouseY / 100) * 100;
        
        dx = (cx - mouseX) * 10;
        dy = (cy - mouseY) * 10;
        
        this.context.lineWidth = BRUSH_SIZE;		
        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.01 * BRUSH_PRESSURE + ")";		

        for (i = 0; i < 50; i++)
        {
            this.context.beginPath();
            this.context.moveTo( cx, cy );
            this.context.quadraticCurveTo(mouseX + Math.random() * dx, mouseY + Math.random() * dy, cx, cy);
            this.context.stroke();
        }
    },

    strokeEnd: function()
    {
        
    }
}
function longfur( context )
{
    this.init( context );
}

longfur.prototype =
{
    context: null,

    points: null, count: null,

    init: function( context )
    {
        this.context = context;
        this.context.globalCompositeOperation = 'source-over';
        
        this.points = new Array();
        this.count = 0;
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
    },

    stroke: function( mouseX, mouseY )
    {
        var i, size, dx, dy, d;

        this.points.push( [ mouseX, mouseY ] );
        
        this.context.lineWidth = BRUSH_SIZE;		
        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.05 * BRUSH_PRESSURE + ")";

        for (i = 0; i < this.points.length; i++)
        {
            size = -Math.random();
            dx = this.points[i][0] - this.points[this.count][0];
            dy = this.points[i][1] - this.points[this.count][1];
            d = dx * dx + dy * dy;

            if (d < 4000 && Math.random() > d / 4000)
            {
                this.context.beginPath();
                this.context.moveTo( this.points[this.count][0] + (dx * size), this.points[this.count][1] + (dy * size));
                this.context.lineTo( this.points[i][0] - (dx * size) + Math.random() * 2, this.points[i][1] - (dy * size) + Math.random() * 2);
                this.context.stroke();
            }
        }
        
        this.count ++;
    },

    strokeEnd: function()
    {
        
    }
}
function ribbon( context )
{
    this.init( context );
}

ribbon.prototype =
{
    context: null,

    mouseX: null, mouseY: null,

    painters: null,

    interval: null,

    init: function( context )
    {
        var scope = this;
        
        this.context = context;
        this.context.globalCompositeOperation = 'source-over';

        this.mouseX = SCREEN_WIDTH / 2;
        this.mouseY = SCREEN_HEIGHT / 2;

        this.painters = new Array();
        
        for (var i = 0; i < 50; i++)
        {
            this.painters.push({ dx: SCREEN_WIDTH / 2, dy: SCREEN_HEIGHT / 2, ax: 0, ay: 0, div: 0.1, ease: Math.random() * 0.2 + 0.6 });
        }
        
        this.interval = setInterval( update, 1000/60 );
        
        function update()
        {
            var i;
            
            this.context.lineWidth = BRUSH_SIZE;			
            this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.05 * BRUSH_PRESSURE + ")";
            
            for (i = 0; i < scope.painters.length; i++)
            {
                scope.context.beginPath();
                scope.context.moveTo(scope.painters[i].dx, scope.painters[i].dy);		

                scope.painters[i].dx -= scope.painters[i].ax = (scope.painters[i].ax + (scope.painters[i].dx - scope.mouseX) * scope.painters[i].div) * scope.painters[i].ease;
                scope.painters[i].dy -= scope.painters[i].ay = (scope.painters[i].ay + (scope.painters[i].dy - scope.mouseY) * scope.painters[i].div) * scope.painters[i].ease;
                scope.context.lineTo(scope.painters[i].dx, scope.painters[i].dy);
                scope.context.stroke();
            }
        }
    },
    
    destroy: function()
    {
        clearInterval(this.interval);
    },

    strokeStart: function( mouseX, mouseY )
    {
        this.mouseX = mouseX;
        this.mouseY = mouseY

        for (var i = 0; i < this.painters.length; i++)
        {
            this.painters[i].dx = mouseX;
            this.painters[i].dy = mouseY;
        }

        this.shouldDraw = true;
    },

    stroke: function( mouseX, mouseY )
    {
        this.mouseX = mouseX;
        this.mouseY = mouseY;
    },

    strokeEnd: function()
    {
    
    }
}
function shaded( context )
{
    this.init( context );
}

shaded.prototype =
{
    context: null,

    prevMouseX: null, prevMouseY: null,

    points: null, count: null,

    init: function( context )
    {
        this.context = context;
        this.context.globalCompositeOperation = 'source-over';

        this.points = new Array();
        this.count = 0;
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    stroke: function( mouseX, mouseY )
    {
        var i, dx, dy, d;

        this.points.push( [ mouseX, mouseY ] );
        
        this.context.lineWidth = BRUSH_SIZE;

        for (i = 0; i < this.points.length; i++)
        {
            dx = this.points[i][0] - this.points[this.count][0];
            dy = this.points[i][1] - this.points[this.count][1];
            d = dx * dx + dy * dy;

            if (d < 1000)
            {
                this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + ((1 - (d / 1000)) * 0.1 * BRUSH_PRESSURE) + " )";

                this.context.beginPath();
                this.context.moveTo( this.points[this.count][0], this.points[this.count][1]);
                this.context.lineTo( this.points[i][0], this.points[i][1]);
                this.context.stroke();
            }
        }

        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;

        this.count ++;
    },

    strokeEnd: function()
    {
        
    }
}


function simple_old( context )
{
    this.init( context );
}

simple_old.prototype =
{
    context: null,

    prevMouseX: null, prevMouseY: null,

    init: function( context )
    {
        this.context = context;
        this.context.globalCompositeOperation = 'source-over';
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    stroke: function( mouseX, mouseY )
    {
        this.context.lineWidth = BRUSH_SIZE;	
        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.5 * BRUSH_PRESSURE + ")";
        
        this.context.beginPath();
        this.context.moveTo(this.prevMouseX, this.prevMouseY);
        this.context.lineTo(mouseX, mouseY);
        this.context.stroke();

        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    strokeEnd: function()
    {
        
    }
}


function simple( context )
{
    this.init( context );
}

simple.prototype =
{
    context: null,

    prevMouseX: null, prevMouseY: null,

    init: function( context )
    {
        this.context = context;
        this.context.globalCompositeOperation = 'source-over';
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    stroke: function( mouseX, mouseY )
    {
        var i, dx, dy, d;
        
        this.context.lineWidth = BRUSH_SIZE;
        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + BRUSH_PRESSURE + ")";
        this.context.beginPath();
        this.context.moveTo(this.prevMouseX, this.prevMouseY);
        this.context.lineTo(mouseX, mouseY);
        this.context.stroke();

        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    strokeEnd: function()
    {
    }
}


function eraser( context ){
    this.context = context;
    this.context.globalCompositeOperation = 'destination-out';
}
eraser.prototype = simple.prototype;


function sketchy( context )
{
    this.init( context );
}

sketchy.prototype =
{
    context: null,

    prevMouseX: null, prevMouseY: null,

    points: null, count: null,

    init: function( context )
    {
        this.context = context;
        this.context.globalCompositeOperation = 'source-over';

        this.points = new Array();
        this.count = 0;
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    stroke: function( mouseX, mouseY )
    {
        var i, dx, dy, d;

        this.points.push( [ mouseX, mouseY ] );

        this.context.lineWidth = BRUSH_SIZE;
        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.05 * BRUSH_PRESSURE + ")";

        this.context.beginPath();
        this.context.moveTo(this.prevMouseX, this.prevMouseY);
        this.context.lineTo(mouseX, mouseY);
        this.context.stroke();

        for (i = 0; i < this.points.length; i++)
        {
            dx = this.points[i][0] - this.points[this.count][0];
            dy = this.points[i][1] - this.points[this.count][1];
            d = dx * dx + dy * dy;

            if (d < 4000 && Math.random() > (d / 2000))
            {
                this.context.beginPath();
                this.context.moveTo( this.points[this.count][0] + (dx * 0.3), this.points[this.count][1] + (dy * 0.3));
                this.context.lineTo( this.points[i][0] - (dx * 0.3), this.points[i][1] - (dy * 0.3));
                this.context.stroke();
            }
        }

        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;

        this.count ++;
    },

    strokeEnd: function()
    {
        
    }
}
function squares( context )
{
    this.init( context );
}

squares.prototype =
{
    context: null,

    prevMouseX: null, prevMouseY: null,

    init: function( context )
    {
        this.context = context;
        this.context.globalCompositeOperation = 'source-over';
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    stroke: function( mouseX, mouseY )
    {
        var dx, dy, angle, px, py;
        
        dx = mouseX - this.prevMouseX;
        dy = mouseY - this.prevMouseY;
        angle = 1.57079633;
        px = Math.cos(angle) * dx - Math.sin(angle) * dy;
        py = Math.sin(angle) * dx + Math.cos(angle) * dy;

        this.context.lineWidth = BRUSH_SIZE;
        //this.context.fillStyle = "rgba(" + BACKGROUND_COLOR[0] + ", " + BACKGROUND_COLOR[1] + ", " + BACKGROUND_COLOR[2] + ", " + BRUSH_PRESSURE + ")";
        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + BRUSH_PRESSURE + ")";
        
        this.context.beginPath();
        this.context.moveTo(this.prevMouseX - px, this.prevMouseY - py);
        this.context.lineTo(this.prevMouseX + px, this.prevMouseY + py);
        this.context.lineTo(mouseX + px, mouseY + py);
        this.context.lineTo(mouseX - px, mouseY - py);
        this.context.lineTo(this.prevMouseX - px, this.prevMouseY - py);
        this.context.fill();
        this.context.stroke();

        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    strokeEnd: function()
    {
        
    }
}
function web( context )
{
    this.init( context );
}

web.prototype =
{
    context: null,

    prevMouseX: null, prevMouseY: null,

    points: null, count: null,

    init: function( context )
    {
        this.context = context;
        this.context.globalCompositeOperation = 'source-over';

        this.points = new Array();
        this.count = 0;
    },

    destroy: function()
    {
    },

    strokeStart: function( mouseX, mouseY )
    {
        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;
    },

    stroke: function( mouseX, mouseY )
    {
        var i, dx, dy, d;

        this.points.push( [ mouseX, mouseY ] );

        this.context.lineWidth = BRUSH_SIZE;
        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.5 * BRUSH_PRESSURE + ")";
        this.context.beginPath();
        this.context.moveTo(this.prevMouseX, this.prevMouseY);
        this.context.lineTo(mouseX, mouseY);
        this.context.stroke();

        this.context.strokeStyle = "rgba(" + COLOR[0] + ", " + COLOR[1] + ", " + COLOR[2] + ", " + 0.1 * BRUSH_PRESSURE + ")";

        for (i = 0; i < this.points.length; i++)
        {
            dx = this.points[i][0] - this.points[this.count][0];
            dy = this.points[i][1] - this.points[this.count][1];
            d = dx * dx + dy * dy;

            if (d < 2500 && Math.random() > 0.9)
            {
                this.context.beginPath();
                this.context.moveTo( this.points[this.count][0], this.points[this.count][1]);
                this.context.lineTo( this.points[i][0], this.points[i][1]);
                this.context.stroke();
            }
        }

        this.prevMouseX = mouseX;
        this.prevMouseY = mouseY;

        this.count ++;
    },

    strokeEnd: function()
    {
        
    }
}

init();
