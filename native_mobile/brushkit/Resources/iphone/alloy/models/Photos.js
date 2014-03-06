exports.definition = {
    config: {
        columns: {
            photo_blob: "blob",
            lat: "numeric",
            "long": "numeric",
            id: "INTEGER PRIMARY KEY AUTOINCREMENT"
        },
        defaults: {},
        adapter: {
            type: "sql",
            collection_name: "photos",
            idAttribute: "id",
            db_name: "newhive",
            db_file: "/newhive.sqlite",
            remoteBackup: false
        }
    },
    extendModel: function(Model) {
        _.extend(Model.prototype, {});
        return Model;
    },
    extendCollection: function(Collection) {
        _.extend(Collection.prototype, {});
        return Collection;
    }
};

var Alloy = require("alloy"), _ = require("alloy/underscore")._, model, collection;

model = Alloy.M("Photos", exports.definition, []);

collection = Alloy.C("Photos", exports.definition, model);

exports.Model = model;

exports.Collection = collection;