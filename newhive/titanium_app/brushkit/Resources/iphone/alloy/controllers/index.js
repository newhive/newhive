function Controller() {
    require("alloy/controllers/BaseController").apply(this, Array.prototype.slice.call(arguments));
    this.__controllerPath = "index";
    arguments[0] ? arguments[0]["__parentSymbol"] : null;
    arguments[0] ? arguments[0]["$model"] : null;
    arguments[0] ? arguments[0]["__itemTemplate"] : null;
    var $ = this;
    var exports = {};
    $.__views.index_window = Ti.UI.createWindow({
        backgroundColor: "white",
        layout: "vertical",
        font: {
            fontSize: "20dp"
        },
        id: "index_window"
    });
    $.__views.index_window && $.addTopLevelView($.__views.index_window);
    $.__views.__alloyId5 = Ti.UI.createLabel({
        top: "20dp",
        font: {
            fontSize: "20dp"
        },
        color: "#fa562d",
        text: "New Hive.",
        id: "__alloyId5"
    });
    $.__views.index_window.add($.__views.__alloyId5);
    $.__views.__alloyId6 = Ti.UI.createImageView({
        top: "40dp",
        image: "/images/logo.png",
        id: "__alloyId6"
    });
    $.__views.index_window.add($.__views.__alloyId6);
    exports.destroy = function() {};
    _.extend($, $.__views);
    checkLogin();
    _.extend($, exports);
}

var Alloy = require("alloy"), Backbone = Alloy.Backbone, _ = Alloy._;

module.exports = Controller;