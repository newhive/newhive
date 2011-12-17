const REV = 6,
       BRUSHES = ["sketchy", "shaded", "chrome", "fur", "longfur", "web", "", "simple", "squares", "ribbon", "", "circles", "grid"],
       USER_AGENT = navigator.userAgent.toLowerCase();

var SCREEN_WIDTH = 1200, //window.innerWidth,
    SCREEN_HEIGHT = 1000, //window.innerHeight,
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
    foregroundColorSelector,
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
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    canvas.style.cursor = 'crosshair';
    container.appendChild(canvas);
    
    context = canvas.getContext("2d");
    
    flattenCanvas = document.createElement("canvas");
    flattenCanvas.width = SCREEN_WIDTH;
    flattenCanvas.height = SCREEN_HEIGHT;
    
    palette = new Palette();
    
    foregroundColorSelector = new ColorSelector(palette);
    foregroundColorSelector.addEventListener('change', onForegroundColorSelectorChange, false);
    container.appendChild(foregroundColorSelector.container);

    //backgroundColorSelector = new ColorSelector(palette);
    //backgroundColorSelector.addEventListener('change', onBackgroundColorSelectorChange, false);
    //container.appendChild(backgroundColorSelector.container);	
    
    menu = new Menu();
    menu.foregroundColor.addEventListener('click', onMenuForegroundColor, false);
    menu.foregroundColor.addEventListener('touchend', onMenuForegroundColor, false);
    //menu.backgroundColor.addEventListener('click', onMenuBackgroundColor, false);
    //menu.backgroundColor.addEventListener('touchend', onMenuBackgroundColor, false);
    menu.selector.addEventListener('change', onMenuSelectorChange, false);
    menu.save.addEventListener('click', onMenuSave, false);
    menu.save.addEventListener('touchend', onMenuSave, false);
    menu.clear.addEventListener('click', onMenuClear, false);
    menu.clear.addEventListener('touchend', onMenuClear, false);
    menu.about.addEventListener('click', onMenuAbout, false);
    menu.about.addEventListener('touchend', onMenuAbout, false);
    menu.container.addEventListener('mouseover', onMenuMouseOver, false);
    menu.container.addEventListener('mouseout', onMenuMouseOut, false);
    container.appendChild(menu.container);

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

    foregroundColorSelector.setColor( COLOR );
    //backgroundColorSelector.setColor( BACKGROUND_COLOR );
    
    if (window.location.hash)
    {
        hash = window.location.hash.substr(1,window.location.hash.length);

        for (i = 0; i < BRUSHES.length; i++)
        {
            if (hash == BRUSHES[i])
            {
                brush = eval("new " + BRUSHES[i] + "(context)");
                menu.selector.selectedIndex = i;
                break;
            }
        }
    }

    if (!brush)
    {
        brush = eval("new " + BRUSHES[0] + "(context)");
    }
    
    about = new About();
    container.appendChild(about.container);
    
    window.addEventListener('mousemove', onWindowMouseMove, false);
    window.addEventListener('resize', onWindowResize, false);
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
    
    onWindowResize(null);

    return container;
}


// WINDOW

//function get_position( event )
//{
//    var poff = $(container).offset();
//    return [event.clientX - poff.left, event.clientY - poff.top];
//}

function onWindowResize()
{
    SCREEN_WIDTH = window.innerWidth;
    SCREEN_HEIGHT = window.innerHeight;
    
    menu.container.style.left = ((SCREEN_WIDTH - menu.container.offsetWidth) / 2) + 'px';
    
    about.container.style.left = ((SCREEN_WIDTH - about.container.offsetWidth) / 2) + 'px';
    about.container.style.top = ((SCREEN_HEIGHT - about.container.offsetHeight) / 2) + 'px';
}

function onWindowKeyDown( event )
{
    if (shiftKeyIsDown)
        return;
        
    switch(event.keyCode)
    {
        case 16: // Shift
            shiftKeyIsDown = true;
            foregroundColorSelector.container.style.left = mouseX - 125 + 'px';
            foregroundColorSelector.container.style.top = mouseY - 125 + 'px';
            foregroundColorSelector.container.style.visibility = 'visible';
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
            foregroundColorSelector.container.style.visibility = 'hidden';			
            break;
            
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

function onForegroundColorSelectorChange( event )
{
    COLOR = foregroundColorSelector.getColor();
    
    menu.setForegroundColor( COLOR );

    if (STORAGE)
    {
        localStorage.brush_color_red = COLOR[0];
        localStorage.brush_color_green = COLOR[1];
        localStorage.brush_color_blue = COLOR[2];		
    }
}

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

function onMenuForegroundColor()
{
    cleanPopUps();
    
    foregroundColorSelector.show();
    foregroundColorSelector.container.style.left = ((SCREEN_WIDTH - foregroundColorSelector.container.offsetWidth) / 2) + 'px';
    foregroundColorSelector.container.style.top = ((SCREEN_HEIGHT - foregroundColorSelector.container.offsetHeight) / 2) + 'px';

    isFgColorSelectorVisible = true;
}

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
    // window.open(canvas.toDataURL('image/png'),'mywindow');
    flatten();
    window.open(flattenCanvas.toDataURL('image/png'),'mywindow');
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

function onMenuAbout()
{
    cleanPopUps();

    isAboutVisible = true;
    about.show();
}


// CANVAS

function onWindowMouseMove(e) {
    //var p = get_position(e);
    mouseX = e.clientX; //p[0];
    mouseY = e.clientY; //p[1];
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
        position = (event.clientX + (event.clientY * canvas.width)) * 4;
        
        foregroundColorSelector.setColor( [ data[position], data[position + 1], data[position + 2] ] );
        
        return;
    }
    
    BRUSH_PRESSURE = wacom && wacom.isWacom ? wacom.pressure : 1;
    
    brush.strokeStart( event.clientX, event.clientY );

    window.addEventListener('mousemove', onCanvasMouseMove, false);
    window.addEventListener('mouseup', onCanvasMouseUp, false);
}

function onCanvasMouseMove( event )
{
    BRUSH_PRESSURE = wacom && wacom.isWacom ? wacom.pressure : 1;
    
    brush.stroke( event.clientX, event.clientY );
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

//

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
function Menu()
{	
    this.init();
}

Menu.prototype = 
{
    container: null,
    
    foregroundColor: null,
    backgroundColor: null,
    
    selector: null,
    save: null,
    clear: null,
    about: null,
    
    init: function()
    {
        var option, space, separator, color_width = 15, color_height = 15;

        this.container = document.createElement("div");
        this.container.className = 'gui';
        this.container.style.position = 'absolute';
        this.container.style.top = '0px';
        
        this.foregroundColor = document.createElement("canvas");
        this.foregroundColor.style.marginBottom = '-3px';
        this.foregroundColor.style.cursor = 'pointer';
        this.foregroundColor.width = color_width;
        this.foregroundColor.height = color_height;
        this.container.appendChild(this.foregroundColor);
        
        this.setForegroundColor( COLOR );
        
        space = document.createTextNode(" ");
        this.container.appendChild(space);

        this.backgroundColor = document.createElement("canvas");
        this.backgroundColor.style.marginBottom = '-3px';
        this.backgroundColor.style.cursor = 'pointer';
        this.backgroundColor.width = color_width;
        this.backgroundColor.height = color_height;
        this.container.appendChild(this.backgroundColor);

        //this.setBackgroundColor( BACKGROUND_COLOR );
        
        space = document.createTextNode(" ");
        this.container.appendChild(space);		
        
        this.selector = document.createElement("select");

        for (i = 0; i < BRUSHES.length; i++)
        {
            option = document.createElement("option");
            option.id = i;
            option.innerHTML = BRUSHES[i].toUpperCase();
            this.selector.appendChild(option);
        }

        this.container.appendChild(this.selector);

        space = document.createTextNode(" ");
        this.container.appendChild(space);
        
        this.save = document.createElement("span"); //getElementById('save');
        this.save.className = 'button';
        this.save.innerHTML = 'Save';
        this.container.appendChild(this.save);
        
        space = document.createTextNode(" ");
        this.container.appendChild(space);
        
        this.clear = document.createElement("Clear");
        this.clear.className = 'button';
        this.clear.innerHTML = 'Clear';
        this.container.appendChild(this.clear);

        separator = document.createTextNode(" | ");
        this.container.appendChild(separator);

        this.about = document.createElement("About");
        this.about.className = 'button';
        this.about.innerHTML = 'About';
        this.container.appendChild(this.about);
    },
    
    setForegroundColor: function( color )
    {
        var context = this.foregroundColor.getContext("2d");
        context.fillStyle = 'rgb(' + color[0] + ', ' + color[1] +', ' + color[2] + ')';
        context.fillRect(0, 0, this.foregroundColor.width, this.foregroundColor.height);
        context.fillStyle = 'rgba(0, 0, 0, 0.1)';
        context.fillRect(0, 0, this.foregroundColor.width, 1);
    },
    
    //setBackgroundColor: function( color )
    //{
    //    var context = this.backgroundColor.getContext("2d");
    //    context.fillStyle = 'rgb(' + color[0] + ', ' + color[1] +', ' + color[2] + ')';
    //    context.fillRect(0, 0, this.backgroundColor.width, this.backgroundColor.height);
    //    context.fillStyle = 'rgba(0, 0, 0, 0.1)';
    //    context.fillRect(0, 0, this.backgroundColor.width, 1);		
    //}
}
function Palette()
{
    var canvas, context, offsetx, offsety, radius = 90,
    count = 1080, oneDivCount = 1 / count, countDiv360 = count / 360, degreesToRadians = Math.PI / 180,
    i, angle, angle_cos, angle_sin, gradient;
    
    canvas = document.createElement("canvas");
    canvas.width = 250;
    canvas.height = 250;
    
    offsetx = canvas.width / 2;
    offsety = canvas.height / 2;
    
    context = canvas.getContext("2d");
    context.lineWidth = 1;
    
    // http://www.boostworthy.com/blog/?p=226
    
    for(i = 0; i < count; i++)
    {
        angle = i / countDiv360 * degreesToRadians;
        angle_cos = Math.cos(angle);
        angle_sin = Math.sin(angle);
        
        context.strokeStyle = "hsl(" + Math.floor( (i * oneDivCount) * 360 ) + ", 100%, 50%)";
        context.beginPath();
        context.moveTo(angle_cos + offsetx, angle_sin + offsety);
        context.lineTo(angle_cos * radius + offsetx, angle_sin * radius + offsety);
        context.stroke();
    }
    
    gradient = context.createRadialGradient(offsetx, offsetx, 0, offsetx, offsetx, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    return canvas;
}
function ColorSelector( gradient )
{
    this.init( gradient );
}

function HSB2RGB(hue, sat, val)
{
    var red, green, blue,
    i, f, p, q, t;

    if (val == 0)
        return [ 0, 0, 0 ];
    
    hue *= 0.016666667; // /= 60;
    sat *= 0.01; // /= 100;
    val *= 0.01; // /= 100;
        
    i = Math.floor(hue);
    f = hue - i;
    p = val * (1 - sat);
    q = val * (1 - (sat * f));
    t = val * (1 - (sat * (1 - f)));
    
    switch(i)
    {
        case 0: red = val; green = t; blue = p; break;
        case 1: red = q; green = val; blue = p; break;
        case 2: red = p; green = val; blue = t; break;
        case 3: red = p; green = q; blue = val; break;
        case 4: red = t; green = p; blue = val; break;
        case 5: red = val; green = p; blue = q; break;
    }
    
    return [red, green, blue];
}

function RGB2HSB(red, green, blue)
{
    var x, f, i, hue, sat, val;

    x = Math.min( Math.min( red, green ), blue );
    val = Math.max( Math.max( red, green ), blue );

    if (x==val)
        return [0, 0, val*100];

    f = (red == x) ? green - blue : ((green == x) ? blue - red : red - green);
    i = (red == x) ? 3 : ((green == x) ? 5 : 1);
    
    hue = Math.floor((i - f / (val - x)) * 60) % 360;
    sat = Math.floor(((val - x) / val) * 100);
    val = Math.floor(val * 100);
    
    return [hue, sat, val];
}

ColorSelector.prototype =
{
    container: null,
    color: [0, 0, 0],

    hueSelector: null,
    luminosity: null,
    luminosityData: null,	
    luminositySelector: null,
    luminosityPosition: null,

    dispatcher: null,
    changeEvent: null,
    
    init: function(gradient)
    {
        var scope = this, context, hue, hueData;

        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.width = '250px';
        this.container.style.height = '250px';
        this.container.style.visibility = 'hidden';
        this.container.style.cursor = 'pointer';
        this.container.addEventListener('mousedown', onMouseDown, false);
        this.container.addEventListener('touchstart', onTouchStart, false);

        hue = document.createElement("canvas");
        hue.width = gradient.width;
        hue.height = gradient.height;
        
        context = hue.getContext("2d");
        context.drawImage(gradient, 0, 0, hue.width, hue.height);

        hueData = context.getImageData(0, 0, hue.width, hue.height).data;	
        
        this.container.appendChild(hue);
        
        this.luminosity = document.createElement("canvas");
        this.luminosity.style.position = 'absolute';
        this.luminosity.style.left = '0px';
        this.luminosity.style.top = '0px';
        this.luminosity.width = 250;
        this.luminosity.height = 250;

        this.container.appendChild(this.luminosity);

        this.hueSelector = document.createElement("canvas");
        this.hueSelector.style.position = 'absolute';
        this.hueSelector.style.left = ((hue.width - 15) / 2 ) + 'px';
        this.hueSelector.style.top = ((hue.height - 15) / 2 ) + 'px';
        this.hueSelector.width = 15;
        this.hueSelector.height = 15;
        
        context = this.hueSelector.getContext("2d");
        context.lineWidth = 2;
        context.strokeStyle = "rgba(0, 0, 0, 0.5)";
        context.beginPath();
        context.arc(8, 8, 6, 0, Math.PI * 2, true);
        context.stroke();
        context.strokeStyle = "rgba(256, 256, 256, 0.8)";
        context.beginPath();
        context.arc(7, 7, 6, 0, Math.PI * 2, true);
        context.stroke();

        this.container.appendChild( this.hueSelector );
        
        this.luminosityPosition = [ (gradient.width - 15), (gradient.height - 15) / 2 ];
        
        this.luminositySelector = document.createElement("canvas");
        this.luminositySelector.style.position = 'absolute';
        this.luminositySelector.style.left = (this.luminosityPosition[0] - 7) + 'px';
        this.luminositySelector.style.top = (this.luminosityPosition[1] - 7) + 'px';
        this.luminositySelector.width = 15;
        this.luminositySelector.height = 15;
        
        context = this.luminositySelector.getContext("2d");
        context.drawImage(this.hueSelector, 0, 0, this.luminositySelector.width, this.luminositySelector.height);
        
        this.container.appendChild(this.luminositySelector);
        
        this.dispatcher = document.createElement('div'); // this could be better handled...
        
        this.changeEvent = document.createEvent('Events');
        this.changeEvent.initEvent('change', true, true);
        
        //
        
        function onMouseDown( event )
        {
            window.addEventListener('mousemove', onMouseMove, false);
            window.addEventListener('mouseup', onMouseUp, false);
            
            update( event.clientX - scope.container.offsetLeft, event.clientY - scope.container.offsetTop );
        }
        
        function onMouseMove( event )
        {
            update( event.clientX - scope.container.offsetLeft, event.clientY - scope.container.offsetTop );
        }

        function onMouseUp( event )
        {
            window.removeEventListener('mousemove', onMouseMove, false);
            window.removeEventListener('mouseup', onMouseUp, false);
        
            update( event.clientX - scope.container.offsetLeft, event.clientY - scope.container.offsetTop );
        }
        
        function onTouchStart( event )
        {
            if(event.touches.length == 1)
            {
                event.preventDefault();

                window.addEventListener('touchmove', onTouchMove, false);
                window.addEventListener('touchend', onTouchEnd, false);
        
                update( event.touches[0].pageX - scope.container.offsetLeft, event.touches[0].pageY - scope.container.offsetTop );
            }
        }

        function onTouchMove( event )
        {
            if(event.touches.length == 1)
            {
                event.preventDefault();
            
                update( event.touches[0].pageX - scope.container.offsetLeft, event.touches[0].pageY - scope.container.offsetTop );
            }
        }

        function onTouchEnd( event )
        {
            if(event.touches.length == 0)
            {
                event.preventDefault();
            
                window.removeEventListener('touchmove', onTouchMove, false);
                window.removeEventListener('touchend', onTouchEnd, false);
            }
        }
        
        //
        
        function update(x, y)
        {
            var dx, dy, d, nx, ny;
            
            dx = x - 125;
            dy = y - 125;
            d = Math.sqrt( dx * dx + dy * dy );

            if (d < 90)
            {
                scope.hueSelector.style.left = (x - 7) + 'px';
                scope.hueSelector.style.top = (y - 7) + 'px';
                scope.updateLuminosity( [ hueData[(x + (y * 250)) * 4], hueData[(x + (y * 250)) * 4 + 1], hueData[(x + (y * 250)) * 4 + 2] ] );
            }
            else if (d > 100)
            {
                nx = dx / d;
                ny = dy / d;
            
                scope.luminosityPosition[0] = (nx * 110) + 125;
                scope.luminosityPosition[1] = (ny * 110) + 125;
            
                scope.luminositySelector.style.left = ( scope.luminosityPosition[0] - 7) + 'px';
                scope.luminositySelector.style.top = ( scope.luminosityPosition[1] - 7) + 'px';
            }
            
            x = Math.floor(scope.luminosityPosition[0]);
            y = Math.floor(scope.luminosityPosition[1]);
        
            scope.color[0] = scope.luminosityData[(x + (y * 250)) * 4];
            scope.color[1] = scope.luminosityData[(x + (y * 250)) * 4 + 1];
            scope.color[2] = scope.luminosityData[(x + (y * 250)) * 4 + 2];			
        
            scope.dispatchEvent( scope.changeEvent );
        }
    },
    
    
    //
    
    show: function()
    {
        this.container.style.visibility = 'visible';
    },
    
    hide: function()
    {
        this.container.style.visibility = 'hidden';		
    },
    
    getColor: function()
    {
        return this.color;
    },
    
    setColor: function( color )
    {
        // Ok, this is super dirty. The whole class needs some refactoring, again! :/
        
        var hsb, angle, distance, rgb, degreesToRadians = Math.PI / 180
    
        this.color = color;
        
        hsb = RGB2HSB(color[0] / 255, color[1] / 255, color[2] / 255);

        angle = hsb[0] * degreesToRadians;
        distance = (hsb[1] / 100) * 90;

        this.hueSelector.style.left = ( ( Math.cos(angle) * distance + 125 ) - 7 ) + 'px';
        this.hueSelector.style.top = ( ( Math.sin(angle) * distance + 125 ) - 7 ) + 'px';

        rgb = HSB2RGB(hsb[0], hsb[1], 100);
        rgb[0] *= 255; rgb[1] *= 255; rgb[2] *= 255;
        
        this.updateLuminosity( rgb );
        
        angle = (hsb[2] / 100) * 360 * degreesToRadians;
        
        this.luminosityPosition[0] = ( Math.cos(angle) * 110 ) + 125;
        this.luminosityPosition[1] = ( Math.sin(angle) * 110 ) + 125;
        
        this.luminositySelector.style.left = ( this.luminosityPosition[0] - 7 ) + 'px';
        this.luminositySelector.style.top = ( this.luminosityPosition[1] - 7 ) + 'px';
        
        this.dispatchEvent( this.changeEvent );
    },
    
    //
    
    updateLuminosity: function( color )
    {
        var context, angle, angle_cos, angle_sin, shade, offsetx, offsety,
        inner_radius = 100, outter_radius = 120, i, count = 1080 / 2, oneDivCount = 1 / count, degreesToRadians = Math.PI / 180,
        countDiv360 = (count / 360);
    
        offsetx = this.luminosity.width / 2;
        offsety = this.luminosity.height / 2;
    
        context = this.luminosity.getContext("2d");
        context.lineWidth = 3;
        context.clearRect(0, 0, this.luminosity.width, this.luminosity.height);
    
        for(i = 0; i < count; i++)
        {
            angle = i / countDiv360 * degreesToRadians;
            angle_cos = Math.cos(angle);
            angle_sin = Math.sin(angle);

            shade = 255 - (i * oneDivCount /* / count */) * 255;
        
            context.strokeStyle = "rgb(" + Math.floor( color[0] - shade ) + "," + Math.floor( color[1] - shade ) + "," + Math.floor( color[2] - shade ) + ")";
            context.beginPath();
            context.moveTo(angle_cos * inner_radius + offsetx, angle_sin * inner_radius + offsety);
            context.lineTo(angle_cos * outter_radius + offsetx, angle_sin * outter_radius + offsety);
            context.stroke();
        }
        
        this.luminosityData = context.getImageData(0, 0, this.luminosity.width, this.luminosity.height).data;	
    },
    
    //
    
    addEventListener: function( type, listener, useCapture )
    {
        this.dispatcher.addEventListener(type, listener, useCapture);
    },
    
    dispatchEvent: function( event )
    {
        this.dispatcher.dispatchEvent(event);
    },
    
    removeEventListener: function( type, listener, useCapture )
    {
        this.dispatcher.removeEventListener(type, listener, useCapture);
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
function About()
{
    this.init();	
}

About.prototype = 
{
    container: null,

    init: function()
    {
        var text, containerText;
        
        this.container = document.createElement("div");
        this.container.className = 'gui';
        this.container.style.position = 'absolute';
        this.container.style.top = '0px';
        this.container.style.visibility = 'hidden';
        
        containerText = document.createElement("div");
        containerText.style.margin = '10px 10px';
        containerText.style.textAlign = 'left';
        this.container.appendChild(containerText);

        text = document.createElement("p");
        text.style.textAlign = 'center';		
        text.innerHTML = '<strong>HARMONY</strong> <a href="changelog.txt" target="_blank">r' + REV + '</a> by <a href="http://twitter.com/mrdoob" target="_blank">Mr.doob</a>';
        containerText.appendChild(text);

        text = document.createElement("p");
        text.style.textAlign = 'center';
        text.innerHTML = 'Brush: <span class="key">d</span><span class="key">f</span> size, <span class="key">r</span> reset<br />Color: <span class="key">shift</span> wheel, <span class="key">alt</span> picker<br />';
        containerText.appendChild(text);

        text = document.createElement("p");
        text.style.textAlign = 'center';
        text.innerHTML = '<a href="http://mrdoob.com/blog/post/689" target="_blank">Info</a> - <a href="http://github.com/mrdoob/harmony" target="_blank">Source Code</a>';
        containerText.appendChild(text);

        text = document.createElement("hr");
        containerText.appendChild(text);

        text = document.createElement("p");
        text.innerHTML = '<em>Sketchy</em>, <em>Shaded</em>, <em>Chrome</em>, <em>Fur</em>, <em>LongFur</em> and <em>Web</em> are all variations of the neighbour points connection concept. First implemented in <a href="http://www.zefrank.com/scribbler/" target="_blank">The Scribbler</a>.';
        containerText.appendChild(text);
        
        text = document.createElement("p");
        text.innerHTML = 'If you like the tool, you can use this button to share your love ;)';
        containerText.appendChild(text);
        
        text = document.createElement("p");
        text.style.textAlign = 'center';
        text.innerHTML = '<form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank"><input type="hidden" name="cmd" value="_s-xclick"><input type="hidden" name="hosted_button_id" value="VY7767JMMMYM4"><input type="image" src="https://www.paypal.com/en_GB/i/btn/btn_donate_SM.gif" border="0" name="submit" alt="PayPal - The safer, easier way to pay online."><img alt="" border="0" src="https://www.paypal.com/en_GB/i/scr/pixel.gif" width="1" height="1"></form>';
        containerText.appendChild(text);
    },
    
    show: function()
    {
        this.container.style.visibility = 'visible';		
    },
    
    hide: function()
    {
        this.container.style.visibility = 'hidden';
    }
}

init();
