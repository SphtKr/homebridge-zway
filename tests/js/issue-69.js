var homebridge = require("../../node_modules/homebridge/lib/api.js");

var api, testPlatform, Service, Characteristic;

api = new homebridge.API();
_initializer(api);
testPlatform = new platform({}, console.log);
Service = api.hap.Service;
Characteristic = api.hap.Characteristic;

test("Issue 69: sensorBinary.alarm_door can create a Door accessory", function() {
  var devicesJson = {"data":{"structureChanged":true,"updateTime":1483686127,"devices":[
    {
      "creationTime": 1479323835,
      "creatorId": 1,
      "deviceType": "sensorBinary",
      "h": 1594949884,
      "hasHistory": false,
      "id": "ZWayVDev_zway_13-0-113-6-Door-A",
      "location": 5,
      "metrics": {
        "icon": "door",
        "level": "off",
        "title": "Fenster Bad"
      },
      "permanently_hidden": false,
      "probeType": "alarm_door",
      "tags": [],
      "visibility": true,
      "updateTime": 1480462200
    },
    {
      "creationTime": 1479323835,
      "creatorId": 1,
      "deviceType": "sensorBinary",
      "h": -2105364498,
      "hasHistory": false,
      "id": "ZWayVDev_zway_13-0-113-7-3-A",
      "location": 5,
      "metrics": {
        "icon": "smoke",
        "level": "on",
        "title": "Fibaro Burglar Alarm (13.0.113.7.3)"
      },
      "permanently_hidden": true,
      "probeType": "alarm_burglar",
      "tags": [],
      "visibility": true,
      "updateTime": 1480462200
    },
    {
      "creationTime": 1479323835,
      "creatorId": 1,
      "deviceType": "sensorBinary",
      "h": -2103519378,
      "hasHistory": false,
      "id": "ZWayVDev_zway_13-0-113-9-1-A",
      "location": 5,
      "metrics": {
        "icon": "alarm",
        "level": "off",
        "title": "Fibaro System Alarm (13.0.113.9.1)"
      },
      "permanently_hidden": true,
      "probeType": "alarm_system",
      "tags": [],
      "visibility": true,
      "updateTime": 1480461223
    },
    {
      "creationTime": 1479323842,
      "creatorId": 1,
      "deviceType": "sensorBinary",
      "h": 146374528,
      "hasHistory": false,
      "id": "ZWayVDev_zway_13-0-156-0-A",
      "location": 5,
      "metrics": {
        "icon": "alarm",
        "level": "on",
        "title": "Fibaro General Purpose alarm Alarm (13.0.156.0)"
      },
      "permanently_hidden": true,
      "probeType": "alarmSensor_general_purpose",
      "tags": [],
      "visibility": true,
      "updateTime": 1480498020
    }
  ]},"code":200,"message":"200 OK","error":null};
  var foundAccessories = testPlatform.buildAccessoriesFromJson(devicesJson);
  assert.equal(foundAccessories.length, 1, "buildAccessoriesFromJson must find exactly one accessory.");
  var acc = new accessory(foundAccessories[0].name, foundAccessories[0].devDesc, testPlatform);
  var services = acc.getServices();
  assert.equal(services.length, 2, "getServices must return two services.");
  //console.log(JSON.stringify(services[1].characteristics, null, 4));
  var dServices = services.filter(function(service){ return service.UUID === Service.Door.UUID; });
  assert.equal(dServices.length, 1, "getServices must return exactly one Door service");
  var cpCxs = dServices[0].characteristics.filter(function(cx){ return cx.UUID === Characteristic.CurrentPosition.UUID; });
  assert.equal(cpCxs.length, 1, "The Door service must have exactly one CurrentPosition Characteristic");
  assert.strictEqual(cpCxs[0].props['maxValue'], 100, "The CurrentPosition Characteristic must equal numeric 100");
});

api = new homebridge.API();
_initializer(api);
testPlatform = new platform({}, console.log);
Service = api.hap.Service;
Characteristic = api.hap.Characteristic;

test("Issue 69: sensorBinary.door-window can create a Door accessory (regression)", function() {
  var devicesJson = {"data":{"structureChanged":true,"updateTime":1483686137,"devices":[
    {
      "creationTime": 1483802176,
      "creatorId": 1,
      "deviceType": "sensorBinary",
      "h": 1303282175,
      "hasHistory": false,
      "id": "ZWayVDev_zway_2-0-48-1",
      "location": 1,
      "metrics": {
        "probeTitle": "General purpose",
        "scaleTitle": "",
        "icon": "motion",
        "level": "on",
        "title": "c"
      },
      "permanently_hidden": false,
      "probeType": "general_purpose",
      "tags": [],
      "visibility": true,
      "updateTime": 1483811173
    },
    {
      "creationTime": 1483802185,
      "creatorId": 1,
      "deviceType": "sensorBinary",
      "h": -613749302,
      "hasHistory": false,
      "id": "ZWayVDev_zway_2-0-113-6-Door-A",
      "location": 1,
      "metrics": {
        "icon": "door",
        "level": "off",
        "title": "Fibaro Access Control Alarm (2.0.113.6.Door)"
      },
      "permanently_hidden": false,
      "probeType": "alarm_door",
      "tags": [],
      "visibility": true,
      "updateTime": 1483864001
    },
    {
      "creationTime": 1483802185,
      "creatorId": 1,
      "deviceType": "sensorBinary",
      "h": -1995004448,
      "hasHistory": false,
      "id": "ZWayVDev_zway_2-0-113-7-3-A",
      "location": 1,
      "metrics": {
        "icon": "smoke",
        "level": "off",
        "title": "Fibaro Burglar Alarm (2.0.113.7.3)"
      },
      "permanently_hidden": false,
      "probeType": "alarm_burglar",
      "tags": [],
      "visibility": true,
      "updateTime": 1483811173
    },
    {
      "creationTime": 1483802190,
      "creatorId": 1,
      "deviceType": "sensorBinary",
      "h": 1129728498,
      "hasHistory": false,
      "id": "ZWayVDev_zway_2-0-156-0-A",
      "location": 1,
      "metrics": {
        "icon": "alarm",
        "level": "on",
        "title": "Fibaro General Purpose alarm Alarm (2.0.156.0)"
      },
      "permanently_hidden": false,
      "probeType": "alarmSensor_general_purpose",
      "tags": [],
      "visibility": true,
      "updateTime": 1483811173
    }
  ]},"code":200,"message":"200 OK","error":null};
  var foundAccessories = testPlatform.buildAccessoriesFromJson(devicesJson);
  assert.equal(foundAccessories.length, 1, "buildAccessoriesFromJson must find exactly one accessory.");
  var acc = new accessory(foundAccessories[0].name, foundAccessories[0].devDesc, testPlatform);
  var services = acc.getServices();
  assert.equal(services.length, 2, "getServices must return two services.");
  //console.log(JSON.stringify(services[1].characteristics, null, 4));
  var dServices = services.filter(function(service){ return service.UUID === Service.Door.UUID; });
  assert.equal(dServices.length, 1, "getServices must return exactly one Door service");
  var cpCxs = dServices[0].characteristics.filter(function(cx){ return cx.UUID === Characteristic.CurrentPosition.UUID; });
  assert.equal(cpCxs.length, 1, "The Door service must have exactly one CurrentPosition Characteristic");
  assert.strictEqual(cpCxs[0].props['maxValue'], 100, "The CurrentPosition Characteristic must equal numeric 100");
});
