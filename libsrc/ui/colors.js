define([], function(){

var colors = [
     '#000000'
    ,'#F73627'
    ,'#E87B25'
    ,'#7BA009'
    ,'#96E2CE'
    ,'#698293'
    ,'#423C3E'
    ,'#9C0008'
    ,'#F9A819'
    ,'#13A507'
    ,'#54D3AC'
    ,'#0A2655'
    ,'#696E76'
    ,'#810032'
    ,'#F45519'
    ,'#0E610E'
    ,'#069674'
    ,'#7F4799'
    ,'#A09B97'
    ,'#F72E4D'
    ,'#703C1F'
    ,'#9E8118'
    ,'#2D6A5D'
    ,'#419DD6'
    ,'#D1D1D1'
    ,'#E27BB6'
    ,'#986970'
    ,'#565E20'
    ,'#68AD92'
    ,'#9196A7'
    ,'#EDEBE1'
    ,'#F3D3C1'
    ,'#FFF673'
    ,'#D6D64D'
    ,'#D0E0F0'
    ,'#FFFFFF'
    ]
;

colors.unselected = colors[30];

colors.black          = colors[0 ];
colors.bright_red     = colors[1 ];
colors.dark_yellow    = colors[2 ];
colors.lime_green     = colors[3 ];
colors.selected       = colors[4 ];
colors.blue           = colors[5 ];
colors.charcoal       = colors[6 ];
colors.maroon         = colors[7 ];
colors.bright_yellow  = colors[8 ];
colors.grass_green    = colors[9 ];
colors.bright_teal    = colors[10];
colors.navy_blue      = colors[11];
colors.grey_medium    = colors[12];
colors.deep_maroon    = colors[13];
colors.orange         = colors[14];
colors.forest_green   = colors[15];
colors.deep_teal      = colors[16];
colors.purple         = colors[17];
colors.light_charcoal = colors[18];
colors.active         = colors[19];
colors.brown          = colors[20];
colors.gold           = colors[21];
colors.forest_teal    = colors[22];
colors.bright_blue    = colors[23];
colors.light_grey     = colors[24];
colors.pink           = colors[25];
colors.mauve          = colors[26];
colors.olive_green    = colors[27];
colors.money_green    = colors[28];
colors.greyish_purple = colors[29];
colors.tan            = colors[30];
colors.pale_pink      = colors[31];
colors.pale_yellow    = colors[32];
colors.pale_lime      = colors[33];
colors.light_blue     = colors[34];
colors.white          = colors[35];


colors.tag_color = function($i, $total) {

    if ($total == 1 ){
        return colors.bright_red;
    } else if ($total == 2 ){
        return [ colors.bright_red, colors.blue][$i];
    } else if ($total == 3 ){
        return [ colors.bright_red, colors.dark_yellow, colors.blue][$i];
    } else if ($total == 4 ){
        return [ colors.bright_red, colors.dark_yellow, colors.lime_green, colors.blue][$i];
    } else if ($total == 5 ){
        return [
            colors.bright_red,
            colors.dark_yellow,
            colors.bright_yellow,
            colors.lime_green,
            colors.blue
            ][$i];
    } else if ($total == 6 ){
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.blue
            ][$i];
    } else if ($total == 7 ){
        return [ 
            colors.bright_red,
            colors.active ,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.blue
            ][$i];
    } else if ($total == 8 ){
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.blue,
            colors.greyish_purple
            ][$i];
    } else if ($total == 9 ){
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.forest_teal,
            colors.blue,
            colors.greyish_purple
            ][$i];
    } else if ($total == 10 ){
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.orange,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.forest_teal,
            colors.blue,
            colors.greyish_purple
            ][$i];
    } else if ($total == 11 ){
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.orange,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.forest_teal,
            colors.blue,
            colors.bright_blue,
            colors.greyish_purple
            ][$i];
    } else if ($total == 12 ){
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.orange,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.deep_teal ,
            colors.forest_teal,
            colors.blue,
            colors.bright_blue,
            colors.greyish_purple
            ][$i];
    } else if ($total == 13 ){
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.orange,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.deep_teal ,
            colors.forest_teal,
            colors.blue,
            colors.bright_blue,
            colors.greyish_purple,
            colors.purple 
            ][$i];
    } else if ($total == 14 ){
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.orange,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.deep_teal ,
            colors.forest_teal,
            colors.blue,
            colors.bright_blue,
            colors.greyish_purple,
            colors.purple ,
            colors.grey_medium 
            ][$i];
    } else if ($total == 15 ){
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.orange,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.deep_teal ,
            colors.forest_teal,
            colors.blue,
            colors.bright_blue,
            colors.greyish_purple,
            colors.purple ,
            colors.grey_medium ,
            colors.charcoal  
            ][$i];
    } else if ($total == 16 ){
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.orange,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.deep_teal ,
            colors.forest_teal,
            colors.blue,
            colors.bright_blue,
            colors.greyish_purple,
            colors.purple ,
            colors.grey_medium ,
            colors.charcoal,
            colors.deep_maroon 
            ][$i];
    } else {
        return [ 
            colors.bright_red ,
            colors.active ,
            colors.orange,
            colors.dark_yellow ,
            colors.bright_yellow,
            colors.lime_green,
            colors.grass_green,
            colors.deep_teal ,
            colors.forest_teal,
            colors.blue,
            colors.bright_blue,
            colors.greyish_purple,
            colors.purple ,
            colors.grey_medium ,
            colors.charcoal,
            colors.deep_maroon 
            ][$i - Math.floor($i / 16) * 16];
    }
};

return colors;

});