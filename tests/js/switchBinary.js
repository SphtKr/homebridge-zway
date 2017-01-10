var homebridge = require("../../node_modules/homebridge/lib/api.js");

var api = new homebridge.API();
_initializer(api);
var testPlatform = new platform({}, console.log);
var Service = api.hap.Service;
var Characteristic = api.hap.Characteristic;

test("switchBinary", function() {
  var devicesJson = {"data":{"structureChanged":true,"updateTime":1483686127,"devices":[
    {
      "creationTime": 1453783771,
      "creatorId": 2,
      "deviceType": "switchBinary",
      "h": 1078449915,
      "hasHistory": true,
      "id": "ZWayVDev_zway_2-0-37",
      "location": 3,
      "metrics": {
        "icon": "switch",
        "title": "Test Lamps",
        "level": "off"
      },
      "permanently_hidden": false,
      "probeType": "",
      "tags": [],
      "visibility": true,
      "updateTime": 1483864350
    }
  ]},"code":200,"message":"200 OK","error":null};
  var foundAccessories = testPlatform.buildAccessoriesFromJson(devicesJson);
  assert.equal(foundAccessories.length, 1, "buildAccessoriesFromJson must find exactly one accessory.");
  var acc = new accessory(foundAccessories[0].name, foundAccessories[0].devDesc, testPlatform);
  var services = acc.getServices();
  assert.equal(services.length, 2, "getServices must return two services.");
  //console.log(JSON.stringify(services[1].characteristics[1], null, 4));
  assert.equal(services[1].characteristics[1].UUID, api.hap.Characteristic.On.UUID, 'services[1].characteristics[1] should be an "On" characteristic');
});

test("switchBinary update", function(){
  var devicesJson = {"data":{"structureChanged":true,"updateTime":1483686137,"devices":[
    {
      "creationTime": 1453783771,
      "creatorId": 2,
      "deviceType": "switchBinary",
      "h": 1078449915,
      "hasHistory": true,
      "id": "ZWayVDev_zway_2-0-37",
      "location": 3,
      "metrics": {
        "icon": "switch",
        "title": "Test Lamps",
        "level": "on"
      },
      "permanently_hidden": false,
      "probeType": "",
      "tags": [],
      "visibility": true,
      "updateTime": 1483686136
    }
  ]},"code":200,"message":"200 OK","error":null};
  testPlatform.processPollUpdate(devicesJson);
  var cxs = testPlatform.cxVDevMap[devicesJson.data.devices[0].id];
  var oncx = cxs.filter(function(cx){ return cx.UUID === Characteristic.On.UUID; })[0];
  assert.strictEqual(oncx.value, true, "Characteristic On updates to value boolean true");
})
