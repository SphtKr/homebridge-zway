var WebSocket = require('ws');
var ws = new WebSocket('ws://192.168.222.16:8083');

ws.on('message', function(data, flags){
  console.log(data);
});

setTimeout(function(){ console.log('Ending.')}, 60000);
