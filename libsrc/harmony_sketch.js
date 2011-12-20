const REV = 6,
       BRUSHES = ["sketchy", "shaded", "chrome", "fur", "longfur", "web", "", "simple", "squares", "ribbon", "", "circles", "grid"],
       USER_AGENT = navigator.userAgent.toLowerCase();

var SCREEN_WIDTH = 1400, //window.innerWidth,
    SCREEN_HEIGHT = 875, //window.innerHeight,
    BRUSH_SIZE = 1,
    BRUSH_PRESSURE = 1,
    COLOR = [0, 0, 0],
    //BACKGROUND_COLOR = [250, 250, 250],
    STORAGE = window.localStorage,
    brush,
    saveTimeOut,
    wacom,
    i,
    mouseX = 0,
    mouseY = 0,
    container,
    //foregroundColorSelector,
    //backgroundColorSelector,
    menu,
    about,
    canvas,
    flattenCanvas,
    context,
    isFgColorSelectorVisible = false,
    //isBgColorSelectorVisible = false,
    isAboutVisible = false,
    isMenuMouseOver = false,
    shiftKeyIsDown = false,
    altKeyIsDown = false;

function init()
{
    var hash, palette, embed, localStorageImage;
    
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
    
    //palette = new Palette();
    
    //foregroundColorSelector = new ColorSelector(palette);
    //foregroundColorSelector.addEventListener('change', onForegroundColorSelectorChange, false);
    //container.appendChild(foregroundColorSelector.container);

    //backgroundColorSelector = new ColorSelector(palette);
    //backgroundColorSelector.addEventListener('change', onBackgroundColorSelectorChange, false);
    //container.appendChild(backgroundColorSelector.container);	
    
    if (STORAGE)
    {
        if (localStorage.canvas)
        {
            localStorageImage = new Image();
        
            localStorageImage.addEventListener("load", function(event)
            {
                localStorageImage.removeEventListener(event.type, arguments.callee, false);
                context.drawImage(localStorageImage,0,0);
            }, false);
            
            localStorageImage.src = localStorage.canvas;			
        }
        
        if (localStorage.brush_color_red)
        {
            COLOR[0] = localStorage.brush_color_red;
            COLOR[1] = localStorage.brush_color_green;
            COLOR[2] = localStorage.brush_color_blue;
        }

        //if (localStorage.background_color_red)
        //{
        //    BACKGROUND_COLOR[0] = localStorage.background_color_red;
        //    BACKGROUND_COLOR[1] = localStorage.background_color_green;
        //    BACKGROUND_COLOR[2] = localStorage.background_color_blue;
        //}
    }

    //foregroundColorSelector.setColor( COLOR );
    //backgroundColorSelector.setColor( BACKGROUND_COLOR );
    
    if (!brush)
    {
        brush = eval("new " + BRUSHES[0] + "(context)");
    }
    
    window.addEventListener('mousemove', onWindowMouseMove, false);
    window.addEventListener('keydown', onWindowKeyDown, false);
    window.addEventListener('keyup', onWindowKeyUp, false);
    window.addEventListener('blur', onWindowBlur, false);
    
    document.addEventListener('mousedown', onDocumentMouseDown, false);
    document.addEventListener('mouseout', onDocumentMouseOut, false);
    
    document.addEventListener("dragenter", onDocumentDragEnter, false);  
    document.addEventListener("dragover", onDocumentDragOver, false);
    //document.addEventListener("drop", onDocumentDrop, false);  
    
    canvas.addEventListener('mousedown', onCanvasMouseDown, false);
    canvas.addEventListener('touchstart', onCanvasTouchStart, false);
    
    return container;
}

function set_brush(name) {
    brush = new window[name](context);
}

function onWindowKeyDown( event )
{
    if (shiftKeyIsDown)
        return;
        
    switch(event.keyCode)
    {
        case 16: // Shift
            shiftKeyIsDown = true;
        //    foregroundColorSelector.container.style.left = mouseX - 125 + 'px';
        //    foregroundColorSelector.container.style.top = mouseY - 125 + 'px';
        //    foregroundColorSelector.container.style.visibility = 'visible';
        //    break;
            
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
        //case 16: // Shift
        //    shiftKeyIsDown = false;
        //    foregroundColorSelector.container.style.visibility = 'hidden';			
        //    break;
            
        case 18: // Alt
            altKeyIsDown = false;
            break;

        case 82: // r
            brush.destroy();
            brush = eval("new " + BRUSHES[menu.selector.selectedIndex] + "(context)");
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

function onDocumentMouseDown( event )
{
    if (!isMenuMouseOver)
        event.preventDefault();
}

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

//function onDocumentDrop( event )
//{
//    event.stopPropagation();  
//    event.preventDefault();
//    
//    var file = event.dataTransfer.files[0];
//    
//    if (file.type.match(/image.*/))
//    {
//        /*
//         * TODO: This seems to work on Chromium. But not on Firefox.
//         * Better wait for proper FileAPI?
//         */
//
//        var fileString = event.dataTransfer.getData('text').split("\n");
//        document.body.style.backgroundImage = 'url(' + fileString[0] + ')';
//    }
//}


// COLOR SELECTORS

//function onForegroundColorSelectorChange( event )
//{
//    COLOR = foregroundColorSelector.getColor();
//    
//    menu.setForegroundColor( COLOR );
//
//    if (STORAGE)
//    {
//        localStorage.brush_color_red = COLOR[0];
//        localStorage.brush_color_green = COLOR[1];
//        localStorage.brush_color_blue = COLOR[2];		
//    }
//}

//function onBackgroundColorSelectorChange( event )
//{
//    BACKGROUND_COLOR = backgroundColorSelector.getColor();
//    
//    menu.setBackgroundColor( BACKGROUND_COLOR );
//    
//    document.body.style.backgroundColor = 'rgb(' + BACKGROUND_COLOR[0] + ', ' + BACKGROUND_COLOR[1] + ', ' + BACKGROUND_COLOR[2] + ')';
//    
//    if (STORAGE)
//    {
//        localStorage.background_color_red = BACKGROUND_COLOR[0];
//        localStorage.background_color_green = BACKGROUND_COLOR[1];
//        localStorage.background_color_blue = BACKGROUND_COLOR[2];				
//    }
//}


// MENU

//function onMenuForegroundColor()
//{
//    cleanPopUps();
//    
//    foregroundColorSelector.show();
//    foregroundColorSelector.container.style.left = ((SCREEN_WIDTH - foregroundColorSelector.container.offsetWidth) / 2) + 'px';
//    foregroundColorSelector.container.style.top = ((SCREEN_HEIGHT - foregroundColorSelector.container.offsetHeight) / 2) + 'px';
//
//    isFgColorSelectorVisible = true;
//}

//function onMenuBackgroundColor()
//{
//    cleanPopUps();
//
//    backgroundColorSelector.show();
//    backgroundColorSelector.container.style.left = ((SCREEN_WIDTH - backgroundColorSelector.container.offsetWidth) / 2) + 'px';
//    backgroundColorSelector.container.style.top = ((SCREEN_HEIGHT - backgroundColorSelector.container.offsetHeight) / 2) + 'px';
//
//    isBgColorSelectorVisible = true;
//}

function onMenuSelectorChange()
{
    if (BRUSHES[menu.selector.selectedIndex] == "")
        return;

    brush.destroy();
    brush = eval("new " + BRUSHES[menu.selector.selectedIndex] + "(context)");

    window.location.hash = BRUSHES[menu.selector.selectedIndex];
}

function onMenuMouseOver()
{
    isMenuMouseOver = true;
}

function onMenuMouseOut()
{
    isMenuMouseOver = false;
}

function onMenuSave()
{
    flatten();
    window.open(flattenCanvas.toDataURL('image/jpeg'),'mywindow');
}

function onMenuClear()
{
    if (!confirm("Are you sure?"))
        return;
        
    context.clearRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    saveToLocalStorage();

    brush.destroy();
    brush = eval("new " + BRUSHES[menu.selector.selectedIndex] + "(context)");
}


// CANVAS
function get_x(e) { return Math.round(event.clientX * (SCREEN_WIDTH / window.innerWidth)); }
function get_y(e) { return Math.round(event.clientY * (SCREEN_HEIGHT / window.innerHeight)); }

function onWindowMouseMove(e) {
    mouseX = get_x(e);
    mouseY = get_y(e);
}

function onCanvasMouseDown( event )
{
    var data, position;

    clearTimeout(saveTimeOut);
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
    
    if (STORAGE)
    {
        clearTimeout(saveTimeOut);
        saveTimeOut = setTimeout(saveToLocalStorage, 2000, true);
    }
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
    localStorage.canvas = canvas.toDataURL('image/png');
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
    if (isFgColorSelectorVisible)
    {
        foregroundColorSelector.hide();
        isFgColorSelectorVisible = false;
    }
        
    //if (isBgColorSelectorVisible)
    //{
    //    backgroundColorSelector.hide();
    //    isBgColorSelectorVisible = false;
    //}
    
    if (isAboutVisible)
    {
        about.hide();
        isAboutVisible = false;
    }
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
