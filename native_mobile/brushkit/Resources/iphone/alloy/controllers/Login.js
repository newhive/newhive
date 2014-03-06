function Controller() {
    function doLogin() {
        var BASE_URL = Titanium.App.Properties.getString("base_url_ssl");
        var url = BASE_URL + "api/user/login";
        var xhr = Ti.Network.createHTTPClient();
        var username = $.textfieldUsername.value;
        var pwd = $.textfieldPwd.value;
        Ti.API.info("username value: " + username);
        if (Titanium.App.Properties.getBool("is_test") && "" == username) {
            username = "viciousesque";
            pwd = "trueman";
        }
        xhr.onload = function() {
            Ti.API.info(this.responseText);
            Ti.API.info("this the login response");
            try {
                JSON.parse(this.responseText);
            } catch (error) {
                Ti.API.info("i am login js and this is NOT json");
                return;
            }
            res = JSON.parse(this.responseText);
            if (res.logged_in) {
                Ti.API.info("login success! " + res.name);
                Ti.App.current_user_name = res.name;
                $.textfieldUsername.blur();
                $.textfieldPwd.blur();
                Ti.App.current_user_name = res.login;
                Ti.App.current_user_id = res.id;
                var creator = Alloy.createController("Create");
                creator.getView("create_window").open();
            } else {
                Ti.API.info("you failed");
                $.error_message.opacity = 1;
                $.retrieve_password.opacity = 1;
            }
        };
        xhr.open("POST", url);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Accepts", "application/json");
        var params = {
            username: username,
            secret: pwd,
            client: "mobile",
            json: "true"
        };
        Ti.API.info("send them params: " + username + ", " + pwd);
        xhr.send(params);
    }
    require("alloy/controllers/BaseController").apply(this, Array.prototype.slice.call(arguments));
    this.__controllerPath = "Login";
    arguments[0] ? arguments[0]["__parentSymbol"] : null;
    arguments[0] ? arguments[0]["$model"] : null;
    arguments[0] ? arguments[0]["__itemTemplate"] : null;
    var $ = this;
    var exports = {};
    var __defers = {};
    $.__views.login_window = Ti.UI.createWindow({
        backgroundColor: "white",
        layout: "composite",
        font: {
            fontSize: "20dp"
        },
        id: "login_window",
        title: "Login"
    });
    $.__views.login_window && $.addTopLevelView($.__views.login_window);
    $.__views.textfields_view = Ti.UI.createView({
        layout: "vertical",
        width: Titanium.UI.FILL,
        height: "190dp",
        top: "40dp",
        backgroundColor: "transparent",
        backgroundImage: "/images/bg_slice_grey_h120.png",
        backgroundRepeat: true,
        zIndex: "10",
        id: "textfields_view"
    });
    $.__views.login_window.add($.__views.textfields_view);
    $.__views.textfieldUsername = Ti.UI.createTextField({
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
        id: "textfieldUsername",
        hintText: "username"
    });
    $.__views.textfields_view.add($.__views.textfieldUsername);
    $.__views.textfieldPwd = Ti.UI.createTextField({
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
        id: "textfieldPwd",
        hintText: "password"
    });
    $.__views.textfields_view.add($.__views.textfieldPwd);
    $.__views.error_message = Ti.UI.createLabel({
        top: "10dp",
        opacity: "0",
        color: "#333333",
        textAlign: "center",
        font: {
            fontSize: "18dp"
        },
        text: "Unrecongized username or password.",
        id: "error_message"
    });
    $.__views.textfields_view.add($.__views.error_message);
    $.__views.retrieve_password = Ti.UI.createLabel({
        top: "10dp",
        width: "70%",
        height: "32dp",
        opacity: "0",
        color: "#fa562d",
        textAlign: "center",
        backgroundColor: "#eee",
        borderColor: "333",
        borderRadius: "1dp",
        font: {
            fontSize: "18dp"
        },
        text: "Retrieve password.",
        id: "retrieve_password"
    });
    $.__views.textfields_view.add($.__views.retrieve_password);
    $.__views.button_view = Ti.UI.createView({
        width: Titanium.UI.FILL,
        height: "80dp",
        bottom: "0dp",
        backgroundColor: "transparent",
        zIndex: "10",
        id: "button_view"
    });
    $.__views.login_window.add($.__views.button_view);
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
        title: "Login"
    });
    $.__views.button_view.add($.__views.submit);
    doLogin ? $.__views.submit.addEventListener("click", doLogin) : __defers["$.__views.submit!click!doLogin"] = true;
    $.__views.blank_view = Ti.UI.createView({
        layout: "composite",
        backgroundColor: "#ffffff",
        width: Titanium.UI.FILL,
        height: Titanium.UI.FILL,
        top: "10dp",
        zIndex: "1",
        id: "blank_view"
    });
    $.__views.login_window.add($.__views.blank_view);
    $.__views.watermark = Ti.UI.createImageView({
        height: "70%",
        opacity: "0.4",
        id: "watermark",
        image: "/images/logo.png"
    });
    $.__views.blank_view.add($.__views.watermark);
    exports.destroy = function() {};
    _.extend($, $.__views);
    arguments[0] || {};
    Ti.API.info("LOADING LOGIN PAGE");
    $.textfieldUsername.addEventListener("focus", function() {
        $.error_message.opacity = "0";
        $.retrieve_password.opacity = "0";
    });
    $.retrieve_password.addEventListener("click", function() {});
    __defers["$.__views.submit!click!doLogin"] && $.__views.submit.addEventListener("click", doLogin);
    _.extend($, exports);
}

var Alloy = require("alloy"), Backbone = Alloy.Backbone, _ = Alloy._;

module.exports = Controller;