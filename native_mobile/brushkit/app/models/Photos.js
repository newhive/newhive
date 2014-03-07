exports.definition = {
	
    config : {
        "columns" : {
            "photo_blob" : "blob",
            "new_hive_id": "text",
            "lat" : "numeric",
            "long" : "numeric",
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

