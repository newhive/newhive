console.log("Pushing test notification")
var gcm = require('node-gcm');
var message = new gcm.Message();
 
//API Server Key
var sender = new gcm.Sender('AIzaSyDwFDcABJN8ldQKGCA2ohiO8kHoFst57X8');
var registrationIds = [];
 
// Value the payload data to send...
message.addDataWithKeyValue('message',"\u270C Peace, Love \u2764 and PhoneGap \u2706!");
message.addDataWithKeyValue('title','Push Notification Sample' );
message.addDataWithKeyValue('msgcnt','3'); // Shows up in the notification in the status bar
message.addDataWithKeyValue('soundname','beep.wav'); //Sound to play upon notification receipt - put in the www folder in app
//message.collapseKey = 'demo';
//message.delayWhileIdle = true; //Default is false
message.timeToLive = 3000;// Duration in seconds to hold in GCM and retry before timing out. Default 4 weeks (2,419,200 seconds) if not specified.
 
// At least one reg id required
registrationIds.push('APA91bGFc1EOjGfdJmadrVUBNhWuwGA4Pq00Bs0Ll0TjWuMrVf8K2OcxAw_39SpTpeQN6dJ4bmcszbqpJde2GcNk2ho-SUyxaNNvJCRmcYixfz93AUh1NQSV4lIU7hTipyZyZMbMp4K0sw9hv_ghUiLF255O9U9iMg');
 
/**
 * Parameters: message-literal, registrationIds-array, No. of retries, callback-function
 */
sender.send(message, registrationIds, 4, function (err, result) {
    console.log(result);
});
console.log("Notification sent")
