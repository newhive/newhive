function Dashboard(id){
    o = {};

    // Private vars
    var charts   = [];  // google.visualization.ChartWrapper[]
    var controls = [];  // google.visualization.ControlWrapper[]
    var data;           // google.visualization.DataTable
    var dash;           // google.visualization.Dashboard

    o.addChart = function(chartWrapper){
        charts.push(chartWrapper);
    };

    o.addControl = function(controlWrapper){
        controls.push(controlWrapper);
    };

    o.data = function(d){
        if (typeof(d) == "undefined") return data;
        data = d;
    };

    o.draw = function(){
        if (controls.length) {
            o.dash = new google.visualization.Dashboard($('#' + id)[0]);
            o.dash.bind(controls, charts);
            o.dash.draw(data);
        } else {
            $.each(charts, function(i, el){
                el.setDataTable(data);
                el.draw();
            });
        }
    }

    o.charts   = charts;
    o.controls = controls;

    return o;
};
