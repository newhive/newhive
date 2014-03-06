function Controller() {
    function publishExrpession() {
        var apps = new Array();
        photosCollection.each(function(p, index) {
            var h = 1188;
            var n_y = h * index;
            apps.push({
                file_id: p.get("new_hive_id"),
                z: index,
                dimensions: [ 1e3, 1188 ],
                position: [ 0, n_y ],
                type: "hive.image"
            });
        });
        var exp = {
            tags: $.tf_tags.value,
            name: $.tf_url.value,
            auth: "public",
            title: $.tf_title.value,
            apps: apps
        };
        Ti.API.info("here is your exp json: " + JSON.stringify(exp));
        var BASE_URL = Titanium.App.Properties.getString("base_url_ssl");
        var url = BASE_URL + "api/expr/save";
        var xhr = Ti.Network.createHTTPClient();
        xhr.onload = function() {
            try {
                JSON.parse(this.responseText);
            } catch (error) {
                alert("upload failed.");
                return;
            }
            res = JSON.parse(this.responseText);
            Ti.API.info("the res: " + this.responseText);
            photosCollection.reset();
            var creator = Alloy.createController("Create");
            creator.getView("create_window").open();
            var BASE_URL_COMMON = Titanium.App.Properties.getString("base_url");
            var viewingURL = BASE_URL_COMMON + Ti.App.current_user_name + "/" + res.name;
            Ti.Platform.openURL(viewingURL);
        };
        xhr.open("POST", url);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Accepts", "application/json");
        var params = {
            client: "mobile",
            json: "true",
            expr: JSON.stringify(exp)
        };
        xhr.send(params);
    }
    require("alloy/controllers/BaseController").apply(this, Array.prototype.slice.call(arguments));
    this.__controllerPath = "Save";
    arguments[0] ? arguments[0]["__parentSymbol"] : null;
    arguments[0] ? arguments[0]["$model"] : null;
    arguments[0] ? arguments[0]["__itemTemplate"] : null;
    var $ = this;
    var exports = {};
    $.__views.save_window = Ti.UI.createWindow({
        backgroundColor: "white",
        layout: "composite",
        font: {
            fontSize: "20dp"
        },
        id: "save_window"
    });
    $.__views.save_window && $.addTopLevelView($.__views.save_window);
    $.__views.top_nav = Ti.UI.createView({
        layout: "composite",
        top: "40dp",
        left: "0dp",
        height: "24dp",
        id: "top_nav"
    });
    $.__views.save_window.add($.__views.top_nav);
    $.__views.image_back = Ti.UI.createImageView({
        left: "20dp",
        top: "0dp",
        height: "24dp",
        id: "image_back",
        image: "/images/arrow_back.png"
    });
    $.__views.top_nav.add($.__views.image_back);
    $.__views.label_save = Ti.UI.createLabel({
        top: "0dp",
        font: {
            fontSize: "24dp",
            fontWeight: "bold"
        },
        color: "#000",
        text: "Save",
        id: "label_save"
    });
    $.__views.top_nav.add($.__views.label_save);
    $.__views.form_elems_view = Ti.UI.createView({
        layout: "vertical",
        top: "80dp",
        left: "20dp",
        id: "form_elems_view"
    });
    $.__views.save_window.add($.__views.form_elems_view);
    $.__views.tf_title = Ti.UI.createTextField({
        left: "0dp",
        width: "80%",
        height: "32dp",
        backgroundColor: "#eee",
        borderWidth: 1,
        borderColor: "#464646",
        color: "#000",
        textAlign: "left",
        font: {
            fontSize: "18dp",
            fontWeight: "bold"
        },
        top: "20dp",
        id: "tf_title",
        hintText: "TITLE"
    });
    $.__views.form_elems_view.add($.__views.tf_title);
    $.__views.tf_url = Ti.UI.createTextField({
        left: "0dp",
        width: "80%",
        height: "32dp",
        backgroundColor: "#eee",
        borderWidth: 1,
        borderColor: "#464646",
        color: "#000",
        textAlign: "left",
        font: {
            fontSize: "18dp",
            fontWeight: "bold"
        },
        top: "40dp",
        id: "tf_url",
        hintText: "URL"
    });
    $.__views.form_elems_view.add($.__views.tf_url);
    $.__views.tf_tags = Ti.UI.createTextField({
        left: "0dp",
        width: "80%",
        height: "32dp",
        backgroundColor: "#eee",
        borderWidth: 1,
        borderColor: "#464646",
        color: "#000",
        textAlign: "left",
        font: {
            fontSize: "18dp",
            fontWeight: "bold"
        },
        top: "10dp",
        id: "tf_tags",
        hintText: "#TAGS"
    });
    $.__views.form_elems_view.add($.__views.tf_tags);
    $.__views.remix_view = Ti.UI.createView({
        top: "40dp",
        height: "40dp",
        id: "remix_view"
    });
    $.__views.form_elems_view.add($.__views.remix_view);
    $.__views.__alloyId3 = Ti.UI.createLabel({
        left: "0dp",
        text: "Allow Others to Remix",
        id: "__alloyId3"
    });
    $.__views.remix_view.add($.__views.__alloyId3);
    $.__views.remix_switch = Ti.UI.createSwitch({
        right: "20dp",
        value: true,
        id: "remix_switch"
    });
    $.__views.remix_view.add($.__views.remix_switch);
    $.__views.public_view = Ti.UI.createView({
        top: "20dp",
        height: "40dp",
        id: "public_view"
    });
    $.__views.form_elems_view.add($.__views.public_view);
    $.__views.__alloyId4 = Ti.UI.createLabel({
        left: "0dp",
        text: "Is Public",
        id: "__alloyId4"
    });
    $.__views.public_view.add($.__views.__alloyId4);
    $.__views.public_switch = Ti.UI.createSwitch({
        right: "20dp",
        value: true,
        id: "public_switch"
    });
    $.__views.public_view.add($.__views.public_switch);
    $.__views.buttons_view = Ti.UI.createView({
        layout: "composite",
        bottom: "0dp",
        height: "25%",
        zIndex: 10,
        id: "buttons_view"
    });
    $.__views.save_window.add($.__views.buttons_view);
    $.__views.btn_save = Ti.UI.createButton({
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
        id: "btn_save"
    });
    $.__views.buttons_view.add($.__views.btn_save);
    exports.destroy = function() {};
    _.extend($, $.__views);
    var photosCollection = Alloy.Collections.Photos;
    $.image_back.addEventListener("click", function() {
        var comp = Alloy.createController("Compose");
        comp.getView("compose_window").open();
    });
    $.btn_save.addEventListener("click", function() {
        var title = $.tf_title.value;
        var url = $.tf_url.value;
        $.tf_tags.value;
        if ("" == title) {
            alert("Please provide a title for your new expression.");
            return;
        }
        if ("" == url) {
            url = title.replace(/[^0-9a-zA-Z]/g, "-").replace(/--+/g, "-").replace(/-$/, "").toLowerCase();
            alert(url);
        }
        publishExrpession();
    });
    $.tf_title.addEventListener("change", function() {
        var title = $.tf_title.value;
        url = title.replace(/[^0-9a-zA-Z]/g, "-").replace(/--+/g, "-").replace(/-$/, "").toLowerCase();
        $.tf_url.value = url;
    });
    $.save_window.addEventListener("click", function() {
        $.tf_title.blur();
        $.tf_url.blur();
        $.tf_tags.blur();
    });
    $.save_window.addEventListener("focus", function() {
        $.tf_title.focus();
    });
    $.tf_title.addEventListener("click", function(e) {
        e.cancelBubble = true;
    });
    $.tf_url.addEventListener("click", function(e) {
        e.cancelBubble = true;
    });
    $.tf_tags.addEventListener("click", function(e) {
        e.cancelBubble = true;
    });
    _.extend($, exports);
}

var Alloy = require("alloy"), Backbone = Alloy.Backbone, _ = Alloy._;

module.exports = Controller;