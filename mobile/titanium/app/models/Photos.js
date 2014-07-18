exports.definition = {
	
    config : {
        "columns" : {
            "photo_blob" : "blob",
            "new_hive_id": "text",
            "width": "numeric",
            "height": "numeric",
            "lat" : "numeric",
            "long" : "numeric",
            "is_uploaded": "integer",
            "id" : "INTEGER PRIMARY KEY AUTOINCREMENT"
        },
        "defaults" : {
        },
		"adapter": {
			"type": "sql",
			"collection_name": "photos",
			"idAttribute": "id",
			"db_name": "newhive",
			"db_file": "/newhive.sqlite",
			"remoteBackup": false
		}
	},		

	extendModel: function(Model) {
		_.extend(Model.prototype, {

		}); // end extend
		
		return Model;
	},
	
	
	extendCollection: function(Collection) {		
		_.extend(Collection.prototype, {
			
			// extended functions go here			
			
		}); // end extend
		
		return Collection;
	}
		
};

