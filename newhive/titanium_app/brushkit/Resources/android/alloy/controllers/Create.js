function Controller() {
    require("alloy/controllers/BaseController").apply(this, Array.prototype.slice.call(arguments));
    this.__controllerPath = "Create";
    arguments[0] ? arguments[0]["__parentSymbol"] : null;
    arguments[0] ? arguments[0]["$model"] : null;
    arguments[0] ? arguments[0]["__itemTemplate"] : null;
    var $ = this;
    var exports = {};
    $.__views.createWindow = Ti.UI.createWindow({
        backgroundColor: "white",
        layout: "vertical",
        title: "Create",
        id: "createWindow"
    });
    $.__views.createTab = Ti.UI.createTab({
        window: $.__views.createWindow,
        id: "createTab",
        title: "Create",
        icon: ""
    });
    $.__views.createTab && $.addTopLevelView($.__views.createTab);
    exports.destroy = function() {};
    _.extend($, $.__views);
    _.extend($, exports);
}

var Alloy = require("alloy"), Backbone = Alloy.Backbone, _ = Alloy._;

module.exports = Controller;