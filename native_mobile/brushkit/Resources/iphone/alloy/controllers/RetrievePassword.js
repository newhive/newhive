function Controller() {
    function doSubmit() {
        var BASE_URL = Titanium.App.Properties.getString("base_url_ssl");
        var url = BASE_URL + "api/user/password_email";
        var xhr = Ti.Network.createHTTPClient();
        var email = $.textfield_email.value;
        Ti.API.info("email value: " + email);
        Ti.API.info("request headers" + xhr.getUsername());
        xhr.onload = function() {
            Ti.API.info(this.responseText);
            try {
                JSON.parse(this.responseText);
            } catch (error) {
                return;
            }
            res = JSON.parse(this.responseText);
        };
        xhr.open("POST", url);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Accepts", "application/json");
        var params = {
            email: email,
            client: "mobile",
            json: "true"
        };
        Ti.API.info("send them params: " + url);
        xhr.send(params);
    }
    require("alloy/controllers/BaseController").apply(this, Array.prototype.slice.call(arguments));
    this.__controllerPath = "RetrievePassword";
    arguments[0] ? arguments[0]["__parentSymbol"] : null;
    arguments[0] ? arguments[0]["$model"] : null;
    arguments[0] ? arguments[0]["__itemTemplate"] : null;
    var $ = this;
    var exports = {};
    $.__views.retrieve_password_window = Ti.UI.createWindow({
        backgroundColor: "white",
        layout: "composite",
        font: {
            fontSize: "20dp"
        },
        id: "retrieve_password_window",
        title: "Retreive Pwd"
    });
    $.__views.retrieve_password_window && $.addTopLevelView($.__views.retrieve_password_window);
    $.__views.textfields_view = Ti.UI.createView({
        layout: "vertical",
        width: Titanium.UI.FILL,
        height: "90dp",
        top: "0dp",
        backgroundColor: "transparent",
        backgroundImage: "/images/bg_slice_grey_h120.png",
        backgroundRepeat: true,
        zIndex: "10",
        id: "textfields_view"
    });
    $.__views.retrieve_password_window.add($.__views.textfields_view);
    $.__views.__alloyId2 = Ti.UI.createLabel({
        top: "10dp",
        text: "Forgot Password",
        id: "__alloyId2"
    });
    $.__views.textfields_view.add($.__views.__alloyId2);
    $.__views.textfield_email = Ti.UI.createTextField({
        top: "18dp",
        width: "70%",
        height: "32dp",
        backgroundColor: "#eee",
        borderWidth: 1,
        borderColor: "#464646",
        color: "#fa562d",
        textAlign: "center",
        font: {
            fontSize: "18dp",
            fontWeight: "bold"
        },
        id: "textfield_email",
        hintText: "Enter Email"
    });
    $.__views.textfields_view.add($.__views.textfield_email);
    $.__views.success_view = Ti.UI.createView({
        top: "20dp",
        opacity: 0,
        id: "success_view"
    });
    $.__views.retrieve_password_window.add($.__views.success_view);
    $.__views.success = Ti.UI.createLabel({
        top: "10dp",
        text: "Success. You will recieve an email shortly.",
        id: "success"
    });
    $.__views.success_view.add($.__views.success);
    $.__views.close = Ti.UI.createButton({
        title: "Close",
        id: "close"
    });
    $.__views.success_view.add($.__views.close);
    $.__views.fail_view = Ti.UI.createView({
        id: "fail_view"
    });
    $.__views.retrieve_password_window.add($.__views.fail_view);
    $.__views.fail = Ti.UI.createLabel({
        top: "10dp",
        text: "Unable to locate account by that email. Try again.",
        id: "fail"
    });
    $.__views.fail_view.add($.__views.fail);
    $.__views.button_view = Ti.UI.createView({
        width: Titanium.UI.FILL,
        height: "80dp",
        bottom: "0dp",
        backgroundColor: "transparent",
        zIndex: "10",
        id: "button_view"
    });
    $.__views.retrieve_password_window.add($.__views.button_view);
    $.__views.submit = Ti.UI.createButton({
        width: Titanium.UI.FILL,
        height: "80dp",
        bottom: "0dp",
        color: "#fff",
        backgroundColor: "transparent",
        backgroundImage: "/images/bg_orange_slice.png",
        backgroundSelectedImage: "/images/bg_grey_slice_inactive.png",
        font: {
            fontSize: "20dp",
            fontWeight: "bold"
        },
        id: "submit",
        title: "Submit"
    });
    $.__views.button_view.add($.__views.submit);
    $.__views.blank_view = Ti.UI.createView({
        layout: "composite",
        backgroundColor: "#ffffff",
        width: Titanium.UI.FILL,
        height: Titanium.UI.FILL,
        top: "10dp",
        zIndex: "1",
        id: "blank_view"
    });
    $.__views.retrieve_password_window.add($.__views.blank_view);
    $.__views.watermark = Ti.UI.createImageView({
        height: "70%",
        opacity: "0.4",
        id: "watermark",
        image: "/images/logo.png"
    });
    $.__views.blank_view.add($.__views.watermark);
    exports.destroy = function() {};
    _.extend($, $.__views);
    $.submit.addEventListener("click", function(e) {
        doSubmit(e);
    });
    _.extend($, exports);
}

var Alloy = require("alloy"), Backbone = Alloy.Backbone, _ = Alloy._;

module.exports = Controller;