function Controller() {
    require("alloy/controllers/BaseController").apply(this, Array.prototype.slice.call(arguments));
    this.__controllerPath = "Create";
    arguments[0] ? arguments[0]["__parentSymbol"] : null;
    arguments[0] ? arguments[0]["$model"] : null;
    arguments[0] ? arguments[0]["__itemTemplate"] : null;
    var $ = this;
    var exports = {};
    $.__views.create_window = Ti.UI.createWindow({
        backgroundColor: "white",
        layout: "composite",
        font: {
            fontSize: "20dp"
        },
        id: "create_window"
    });
    $.__views.create_window && $.addTopLevelView($.__views.create_window);
    $.__views.logo = Ti.UI.createImageView({
        top: "40dp",
        id: "logo",
        image: "/images/logo_with_name.png"
    });
    $.__views.create_window.add($.__views.logo);
    $.__views.create_icon = Ti.UI.createImageView({
        top: "200dp",
        id: "create_icon",
        image: "/images/create_page.png"
    });
    $.__views.create_window.add($.__views.create_icon);
    $.__views.select = Ti.UI.createButton({
        width: "50%",
        height: "80dp",
        left: "0dp",
        bottom: "0dp",
        color: "#fff",
        borderColor: "fff",
        borderWidth: "1dp",
        backgroundColor: "transparent",
        backgroundImage: "/images/bg_orange_slice.png",
        backgroundSelectedImage: "/images/bg_grey_slice_inactive.png",
        font: {
            fontSize: "20dp",
            fontWeight: "bold"
        },
        title: "Select",
        id: "select"
    });
    $.__views.create_window.add($.__views.select);
    $.__views.take = Ti.UI.createButton({
        width: "50%",
        height: "80dp",
        right: "0dp",
        bottom: "0dp",
        color: "#fff",
        borderColor: "fff",
        borderWidth: "1dp",
        backgroundColor: "transparent",
        backgroundImage: "/images/bg_orange_slice.png",
        backgroundSelectedImage: "/images/bg_grey_slice_inactive.png",
        font: {
            fontSize: "20dp",
            fontWeight: "bold"
        },
        title: "Take",
        id: "take"
    });
    $.__views.create_window.add($.__views.take);
    exports.destroy = function() {};
    _.extend($, $.__views);
    $.select.addEventListener("click", function() {
        showHiveGallery();
    });
    $.take.addEventListener("click", function() {
        showHiveCamera();
    });
    _.extend($, exports);
}

var Alloy = require("alloy"), Backbone = Alloy.Backbone, _ = Alloy._;

module.exports = Controller;