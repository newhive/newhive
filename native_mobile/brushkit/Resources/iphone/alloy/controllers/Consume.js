function Controller() {
    require("alloy/controllers/BaseController").apply(this, Array.prototype.slice.call(arguments));
    this.__controllerPath = "Consume";
    arguments[0] ? arguments[0]["__parentSymbol"] : null;
    arguments[0] ? arguments[0]["$model"] : null;
    arguments[0] ? arguments[0]["__itemTemplate"] : null;
    var $ = this;
    var exports = {};
    $.__views.consumeWindow = Ti.UI.createWindow({
        backgroundColor: "white",
        layout: "vertical",
        font: {
            fontSize: "20dp"
        },
        title: "Consume",
        id: "consumeWindow"
    });
    var __alloyId1 = [];
    $.__views.thing1 = Ti.UI.createWebView({
        id: "thing1",
        url: "http://tnh.me/5303c8c2ff30d90fac37e73f"
    });
    __alloyId1.push($.__views.thing1);
    $.__views.thing2 = Ti.UI.createWebView({
        id: "thing2",
        url: "http://tnh.me/5302c761082d772a09f40337"
    });
    __alloyId1.push($.__views.thing2);
    $.__views.thing3 = Ti.UI.createWebView({
        id: "thing3",
        url: "http://tnh.me/52fd51df082d7707e2375ca4"
    });
    __alloyId1.push($.__views.thing3);
    $.__views.thing4 = Ti.UI.createWebView({
        id: "thing4",
        url: "http://tnh.me/52fd6abb082d77748b0c8ca1"
    });
    __alloyId1.push($.__views.thing4);
    $.__views.__alloyId0 = Ti.UI.createScrollableView({
        views: __alloyId1,
        id: "__alloyId0"
    });
    $.__views.consumeWindow.add($.__views.__alloyId0);
    $.__views.consumeTab = Ti.UI.createTab({
        window: $.__views.consumeWindow,
        id: "consumeTab",
        title: "Consume",
        icon: ""
    });
    $.__views.consumeTab && $.addTopLevelView($.__views.consumeTab);
    exports.destroy = function() {};
    _.extend($, $.__views);
    _.extend($, exports);
}

var Alloy = require("alloy"), Backbone = Alloy.Backbone, _ = Alloy._;

module.exports = Controller;