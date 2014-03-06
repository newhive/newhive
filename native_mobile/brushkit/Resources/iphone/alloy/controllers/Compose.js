function Controller() {
    require("alloy/controllers/BaseController").apply(this, Array.prototype.slice.call(arguments));
    this.__controllerPath = "Compose";
    arguments[0] ? arguments[0]["__parentSymbol"] : null;
    arguments[0] ? arguments[0]["$model"] : null;
    arguments[0] ? arguments[0]["__itemTemplate"] : null;
    var $ = this;
    var exports = {};
    $.__views.compose_window = Ti.UI.createWindow({
        backgroundColor: "white",
        layout: "composite",
        font: {
            fontSize: "20dp"
        },
        id: "compose_window"
    });
    $.__views.compose_window && $.addTopLevelView($.__views.compose_window);
    $.__views.scroll_view = Ti.UI.createScrollView({
        top: "8%",
        height: "67%",
        zIndex: 1,
        id: "scroll_view",
        layout: "vertical"
    });
    $.__views.compose_window.add($.__views.scroll_view);
    $.__views.buttons_view = Ti.UI.createView({
        layout: "composite",
        bottom: "0dp",
        height: "25%",
        zIndex: 10,
        id: "buttons_view"
    });
    $.__views.compose_window.add($.__views.buttons_view);
    $.__views.select = Ti.UI.createButton({
        width: "50%",
        height: "49%",
        left: "0dp",
        top: "0dp",
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
    $.__views.buttons_view.add($.__views.select);
    $.__views.take = Ti.UI.createButton({
        width: "50%",
        height: "49%",
        right: "0dp",
        top: "0dp",
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
    $.__views.buttons_view.add($.__views.take);
    $.__views.save = Ti.UI.createButton({
        width: "100%",
        height: "49%",
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
        title: "Save",
        id: "save"
    });
    $.__views.buttons_view.add($.__views.save);
    exports.destroy = function() {};
    _.extend($, $.__views);
    var photosCollection = Alloy.Collections.Photos;
    $.compose_window.addEventListener("focus", function() {
        $.scroll_view.removeAllChildren();
        photosCollection.each(function(p, index) {
            if (void 0 != p) {
                var img = p.get("photo_blob");
                var img_view = Ti.UI.createImageView({
                    image: img,
                    width: "99%"
                });
                index + 1 == photosCollection.length && img_view.addEventListener("postlayout", function() {
                    $.scroll_view.scrollToBottom();
                });
                $.scroll_view.add(img_view);
            }
        });
    });
    $.select.addEventListener("click", function() {
        showHiveGallery();
    });
    $.take.addEventListener("click", function() {
        showHiveCamera();
    });
    $.save.addEventListener("click", function() {
        var save = Alloy.createController("Save");
        save.getView("save_window").open();
    });
    _.extend($, exports);
}

var Alloy = require("alloy"), Backbone = Alloy.Backbone, _ = Alloy._;

module.exports = Controller;