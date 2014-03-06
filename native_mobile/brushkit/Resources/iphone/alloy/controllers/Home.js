function Controller() {
    function buildHomeScreen() {
        void 0 != $.home_view && $.homeWindow.remove($.home_view);
        $.home_view = Ti.UI.createScrollView({
            id: "home_view",
            layout: "composite"
        });
        $.homeWindow.add($.home_view);
        $.homeWindow.title = Ti.App.current_user_first_name;
    }
    require("alloy/controllers/BaseController").apply(this, Array.prototype.slice.call(arguments));
    this.__controllerPath = "Home";
    arguments[0] ? arguments[0]["__parentSymbol"] : null;
    arguments[0] ? arguments[0]["$model"] : null;
    arguments[0] ? arguments[0]["__itemTemplate"] : null;
    var $ = this;
    var exports = {};
    $.__views.homeWindow = Ti.UI.createWindow({
        backgroundColor: "white",
        layout: "vertical",
        font: {
            fontSize: "20dp"
        },
        id: "homeWindow",
        title: "Home"
    });
    $.__views.home_view = Ti.UI.createScrollView({
        id: "home_view",
        layout: "composite"
    });
    $.__views.homeWindow.add($.__views.home_view);
    $.__views.homeTab = Ti.UI.createTab({
        window: $.__views.homeWindow,
        id: "homeTab",
        title: "Home",
        icon: "images/home_icon.png",
        activeIcon: "images/home_icon_active.png"
    });
    $.__views.homeTab && $.addTopLevelView($.__views.homeTab);
    exports.destroy = function() {};
    _.extend($, $.__views);
    $.homeWindow.addEventListener("focus", function() {
        if (void 0 == Ti.App.current_user_id) {
            var loginController = Alloy.createController("Login", {
                parentTab: $.homeTab
            });
            $.homeTab.open(loginController.getView());
        } else {
            addCameraButtonToWindow($.homeWindow);
            buildHomeScreen();
        }
    });
    _.extend($, exports);
}

var Alloy = require("alloy"), Backbone = Alloy.Backbone, _ = Alloy._;

module.exports = Controller;