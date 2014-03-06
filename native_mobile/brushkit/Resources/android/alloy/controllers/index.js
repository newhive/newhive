function Controller() {
    require("alloy/controllers/BaseController").apply(this, Array.prototype.slice.call(arguments));
    this.__controllerPath = "index";
    arguments[0] ? arguments[0]["__parentSymbol"] : null;
    arguments[0] ? arguments[0]["$model"] : null;
    arguments[0] ? arguments[0]["__itemTemplate"] : null;
    var $ = this;
    var exports = {};
    var __alloyId2 = [];
    $.__views.__alloyId3 = Alloy.createController("Consume", {
        id: "__alloyId3"
    });
    __alloyId2.push($.__views.__alloyId3.getViewEx({
        recurse: true
    }));
    $.__views.__alloyId4 = Alloy.createController("Create", {
        id: "__alloyId4"
    });
    __alloyId2.push($.__views.__alloyId4.getViewEx({
        recurse: true
    }));
    $.__views.tabGroup = Ti.UI.createTabGroup({
        tabs: __alloyId2,
        id: "tabGroup"
    });
    $.__views.tabGroup && $.addTopLevelView($.__views.tabGroup);
    exports.destroy = function() {};
    _.extend($, $.__views);
    Ti.App.tabGroup = $.tabGroup;
    $.tabGroup.open();
    _.extend($, exports);
}

var Alloy = require("alloy"), Backbone = Alloy.Backbone, _ = Alloy._;

module.exports = Controller;