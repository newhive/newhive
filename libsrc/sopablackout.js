(function(){var e=function(){},h=function(b,a,c,d){b.addEventListener?b.addEventListener(a,c,!1):b.attachEvent&&(b["e"+a+c]=c,b[a+c]=function(){b["e"+a+c](window.event,d)},b.attachEvent("on"+a,b[a+c]))},i=function(b,a){var c=b.document,d=!1;(function(){try{c.documentElement.doScroll("left")}catch(b){setTimeout(arguments.callee,50);return}d||(d=!0,a())})();c.onreadystatechange=function(){if("complete"==c.readyState)c.onreadystatechange=null,d||(d=!0,a())}},j=function(b){var a=0,c=0;if(b.offsetParent){do a+=
b.offsetLeft,c+=b.offsetTop;while(b=b.offsetParent)}return[a,c]},f=function(b,a){var c=document.createElement(b),a=null!==a?a:{},d;for(d in a)"href"==d?c.href=a[d]:c.style[d]=a[d];l=arguments.length;for(d=2;d<l;d++)c.appendChild(arguments[d]);return c};e.VERSION="0.2.0";e.MIN_HEIGHT=100;e.HEADER_TEXT="This is what the web could look like under the Stop Online Piracy Act.";e.CONTINUE_TEXT="(click anywhere to continue)";e.ZINDEX=Math.pow(2,31)-2;e.DEFAULTS={id:!1,srsbzns:!1,on:!1};e.blackout=function(b){var a,
c=document.body;if(!1===b.id)a=c,d="100%";else{a=document.getElementById(b.id);var d=parseInt(a.currentStyle?a.currentStyle.height:document.defaultView&&document.defaultView.getComputedStyle?document.defaultView.getComputedStyle(a,"").height:a.style.height,10),d=d>e.MIN_HEIGHT?d:e.MIN_HEIGHT}a=j(a);var g=f("div",{position:"absolute",top:a[1],width:"100%",backgroundColor:"black",textAlign:"center",paddingTop:"10px",zIndex:e.ZINDEX,height:d,color:"#999"},f("h1",{color:"#999"},document.createTextNode(e.HEADER_TEXT)),
f("p",null,document.createTextNode("Keep the web open. "),f("a",{href:"https://wfc2.wiredforchange.com/o/9042/p/dia/action/public/?action_KEY=8173"},document.createTextNode("Contact your representatives")),document.createTextNode(" or "),f("a",{href:"http://sopablackout.org/learnmore"},document.createTextNode("find out more."))));!0!==b.srsbzns&&(g.appendChild(f("p",{paddingTop:"250px",color:"#333"},document.createTextNode(e.CONTINUE_TEXT))),h(g,"click",function(){c.removeChild(g)}));c.appendChild(g)};
e.go=function(){var b={},a;for(a in e.DEFAULTS){var c="sopablackout_"+a;b[a]="undefined"===typeof window[c]?e.DEFAULTS[a]:window[c]}if(a=!1!==b.on)a=b.on,a.push(!1),a.push(!1),a.push(!1),c=new Date,a=!!(!1!==a[0]&&c.getFullYear()!==a[0]||!1!==a[1]&&c.getMonth()+1!==a[1]||!1!==a[2]&&c.getDate()!==a[2]);a||e.blackout(b)};(function(b){document.addEventListener?document.addEventListener("DOMContentLoaded",b,!1):i(window,b)})(e.go)}).call(this);
