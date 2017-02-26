var homebridge = require("../../node_modules/homebridge/lib/api.js");

var api = new homebridge.API();
_initializer(api);
var testPlatform = new platform({}, console.log);
var Service = api.hap.Service;
var Characteristic = api.hap.Characteristic;

test("Change in updateTime (only) causes two change events from ContactSensors", function() {
  var devicesJson = {"data":{"structureChanged":true,"updateTime":1488002598,"devices":[
    {
      "creationTime": 1482335001,
      "creatorId": 2,
      "deviceType": "sensorBinary",
      "h": -1774790026,
      "hasHistory": true,
      "id": "ZWayVDev_zway_41-0-48-1",
      "location": 12,
      "metrics": {
        "probeTitle": "General purpose",
        "scaleTitle": "",
        "icon": "motion",
        "level": "off",
        "title": "Mailbox Sensor"
      },
      "permanently_hidden": false,
      "probeType": "general_purpose",
      "tags": [],
      "visibility": true,
      "updateTime": 1487924946
    }
  ]},"code":200,"message":"200 OK","error":null};
  var foundAccessories = testPlatform.buildAccessoriesFromJson(devicesJson);
  assert.equal(foundAccessories.length, 1, "buildAccessoriesFromJson must find exactly one accessory.");
  var acc = new accessory(foundAccessories[0].name, foundAccessories[0].devDesc, testPlatform);
  var services = acc.getServices();
  assert.equal(services.length, 2, "getServices must return two services.");
  //console.log(JSON.stringify(services[1].characteristics, null, 4));
  var csServices = services.filter(function(service){ return service.UUID === Service.ContactSensor.UUID; });
  assert.equal(csServices.length, 1, "getServices must return exactly one ContactSensor service");
  var cssCxs = csServices[0].characteristics.filter(function(cx){ return cx.UUID === Characteristic.ContactSensorState.UUID; });
  assert.equal(cssCxs.length, 1, "The ContactSensor service must have exactly one ContactSensorState Characteristic");
  var cssCx = cssCxs[0];
  assert.strictEqual(cssCx.value, Characteristic.ContactSensorState.CONTACT_DETECTED, "Characteristic ContactSensorState must have value CONTACT_DETECTED");

  var updateJson = {"data":{"structureChanged":true,"updateTime":1488002600,"devices":[
    {
      "creationTime": 1482335001,
      "creatorId": 2,
      "deviceType": "sensorBinary",
      "h": -1774790026,
      "hasHistory": true,
      "id": "ZWayVDev_zway_41-0-48-1",
      "location": 12,
      "metrics": {
        "probeTitle": "General purpose",
        "scaleTitle": "",
        "icon": "motion",
        "level": "off",
        "title": "Mailbox Sensor"
      },
      "permanently_hidden": false,
      "probeType": "general_purpose",
      "tags": [],
      "visibility": true,
      "updateTime": 1488002599
    }
  ]},"code":200,"message":"200 OK","error":null};

  //var changedToOpen = assert.async();
  //var changedToClosed = assert.async();
  var hasChangedToOpen = false;
  cssCx.on('change', function(ev){
    if(ev.newValue == Characteristic.ContactSensorState.CONTACT_NOT_DETECTED){
      assert.ok(!hasChangedToOpen, "A change event to CONTACT_NOT_DETECTED was observed before a change to CONTACT_DETECTED was observed.");
      hasChangedToOpen = true;
      //changedToOpen();
      start();
    }
    if(ev.newValue == Characteristic.ContactSensorState.CONTACT_DETECTED){
      assert.ok(hasChangedToOpen, "A change event to CONTACT_DETECTED was observed after a change to CONTACT_NOT_DETECTED was observed.");
      //changedToClosed();
      start();
    }
  });

  testPlatform.processPollUpdate(devicesJson);
  expect(7);
  stop();
})
