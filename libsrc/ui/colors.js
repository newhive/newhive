define([], function(){

var colors = [
     '#000000'
    ,'#FF3C00'
    ,'#EA902F'
    ,'#96AA04'
    ,'#ACEFE2'
    ,'#698394'
    ,'#464646'
    ,'#AF001E'
    ,'#FFCA40'
    ,'#38D65A'
    ,'#024E63'
    ,'#652A6B'
    ,'#7A7F87'
    ,'#AD055A'
    ,'#FC6215'
    ,'#587F7A'
    ,'#30B2E5'
    ,'#BA5DB1'
    ,'#B5AEA9'
    ,'#F9485A'
    ,'#894C29'
    ,'#84CEB7'
    ,'#49A7B7'
    ,'#A5898C'
    ,'#D9DADC'
    ,'#F9B4BF'
    ,'#D8A045'
    ,'#6E7839'
    ,'#9CD8E5'
    ,'#BFC3D6'
    ,'#E0DDDA'
    ,'#F9E9E4'
    ,'#FFF685'
    ,'#DBEA4E'
    ,'#E6F3FC'
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

