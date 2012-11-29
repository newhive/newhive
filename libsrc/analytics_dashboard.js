function Dashboard(id){
    o = {};

    // Private vars
    var charts   = [];  // google.visualization.ChartWrapper[]
    var controls = [];  // google.visualization.ControlWrapper[]
    var data;           // google.visualization.DataTable
    var dash;           // google.visualization.Dashboard

    o.charts   = charts;
    o.controls = controls;
    o.data     = data;    
    o.dash     = dash;    

    o.addChart = function(chartWrapper){
        i = charts.push(chartWrapper) - 1;
        chartWrapper.setContainerId('chart_' + id + '_' + i);
    };

    o.addControl = function(controlWrapper){
        i = controls.push(controlWrapper) - 1;
        controlWrapper.setContainerId('control_' + id + '_' + i);
    };

    o.data = function(d){
        if (typeof(d) == "undefined") return data;
        data = d;
    };

    var prepareDOM = function(){
        o.div = $('<div>').addClass('dashboard').attr('id', 'dash_' + id);
        o.chartDiv = [];
        o.controlDiv = [];
        $.each(charts, function(i, chart){
            var div = $('<div>').addClass('chart').attr('id', 'chart_' + id + '_' + i);
            o.chartDiv.push( div );
            o.div.append(div);
        });
        $.each(controls, function(i, control){
            var div = $('<div>').addClass('control').attr('id', 'control_' + id + '_' + i);
            div.height(control.getOption('height'));
            o.controlDiv.push( div );
            o.div.append(div);
        });
        $('#content').append(o.div);
    };

    o.draw = function(){
        if (! $('#dash_' + id).length ) prepareDOM();
        if (controls.length) {
            dash = new google.visualization.Dashboard(o.div[0]);
            dash.bind(controls, charts);
            dash.draw(data);
        } else {
            $.each(charts, function(i, el){
                el.setDataTable(data);
                el.draw();
            });
        }
    }

    return o;
};
