if (typeof(Hive) === "undefined") Hive = {};

Hive.chart = {};
Hive.chart.Basic = function(x_axis, y_series, opts){
    var o = $.extend({
        width: 960,
        height: 450,
        padding_top: 10,
        padding_left: 40,
        chart_id: '#chart'
    }, opts);
    o.full_width = o.width + o.padding_left
    y_series = [y_series] // Temporary, should support multiple series
    o.x_axis = x_axis;
    o.y_series = y_series;

    var nanFilter = function(el) { if (!isNaN(el)) return el };
    var max_value = d3.max(
        $.map(y_series, function(el) { return el.length > 1 ? $.map(el, nanFilter) : el })
    );

    o.x_range = [o.width * 0.02 + o.padding_left, o.width * .98 + o.padding_left];
    var x = o.x = d3.scale.linear().domain([d3.min(o.x_axis), d3.max(o.x_axis)]).range(o.x_range);

    var y = o.y = d3.scale.linear().domain([0, max_value]).range([o.height + o.padding_top, o.padding_top]);

    o.get_x_labels = function(){ return o.x_label };

    var y_ticks = y.ticks(5);
    o.draw_chart = function(){
        o.chart = d3.select(o.chart_id).append('svg').attr('class', 'chart')
            .attr('display', 'block')
            .attr('width', o.width + o.padding_left)
            .attr('height', o.height + o.padding_top + 20);

        // Background
        o.background = o.chart.append("rect")
            .attr("width", o.width)
            .attr("height", o.height)
            .attr("y", o.padding_top)
            .attr("x", o.padding_left)
            .attr("class", "background");
        
        // y-axis labels
        o.y_grid = o.chart.selectAll("line.yGrid")
            .data(y_ticks).enter().append("line")
            .attr("class", "yGrid")
            .attr("x2", o.padding_left).attr("x1", o.width + o.padding_left)
            .attr("y2", o.y)
            .attr("y1", o.y)
        
        o.y_label = o.chart.selectAll("text.yLabel")
            .data(y_ticks).enter().append("text")
            .attr("class", "yLabel")
            .attr("x", o.padding_left - 5)
            .attr("y", o.y)
            .attr("text-anchor", "end")
            .attr("dy", ".35em")
            .text(String);

        // x-axis labels
        //var x_label_text = o.get_x_labels();
        //o.x_labels = o.chart.selectAll("text.xLabel")
        //    .data(x_label_text)
        //    .enter().append("text")
        //    //.attr("class", function(d,i){ return "xLabel i" + (i + meta.cohorts.length - meta.dates.length)})
        //    .attr("x", o.x)
        //    .attr("y", o.height + 30)
        //    .attr("text-anchor", "middle")
        //    .attr("font-weight", "bold")
        //    .text(String); //TODO: change to function taking the place of get_x_labels

        // data-series
        o.line_generator = d3.svg.line().x(o.x).y(o.y);
        $.each(y_series, function(i, data){
            o.chart.append("svg:path")
                .attr("d", o.line_generator(data, o.x_axis))
                .attr("class", "i" + i);
        });
    };

    return o;
};

Hive.chart.Time = function(x_axis, y_series, opts) {
    x_axis_values = $.map(x_axis, function(el){ var d = new Date(el); return d.valueOf()});
    var o = Hive.chart.Basic(x_axis_values, y_series, opts);

    var monthFormatter = d3.time.format("%b %y");
    o.get_x_labels = function(){
        return $.map(x_axis, function(el) { return monthFormatter(new Date(el)) });
    };

    o.x = function(d,i){
        return d3.scale.linear().domain([0, o.x_axis.length]).range(o.x_range)(i);
    };
    return o;
};

//function(d) { return Math.round(d * 100) + "%" } String conversion function for percents
