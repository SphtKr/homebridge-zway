var homebridge = require("../../node_modules/homebridge/lib/api.js");

var api = new homebridge.API();
_initializer(api);
var testPlatform = new platform({}, console.log);
var Service = api.hap.Service;
var Characteristic = api.hap.Characteristic;
var ZWayServerPlatform = platform;

test("Issue 48 published devices", function() {
  var devicesJson = require('../data/issue-48.json');
  var foundAccessories = testPlatform.buildAccessoriesFromJson(devicesJson);
  assert.equal(foundAccessories.length, 1, "buildAccessoriesFromJson must find 1 accessory.");
  var acc = new accessory(foundAccessories[0].name, foundAccessories[0].devDesc, testPlatform);
  var services = acc.getServices();
  assert.equal(services.length, 4, "getServices must return four services.");
  console.log(JSON.stringify(services, null, 5));

  var fsvcs, cxs;

  fsvcs = services.filter(function(service){ return service.UUID === Service.Switch.UUID; });
  assert.equal(fsvcs.length, 1, "getServices must return exactly one Switch service");
  var cxs = fsvcs[0].characteristics.filter(function(cx){ return cx.UUID === Characteristic.On.UUID; });
  assert.equal(cxs.length, 1, "The Switch service must have exactly one On Characteristic");

  fsvcs = services.filter(function(service){ return service.UUID === Service.TemperatureSensor.UUID; });
  assert.equal(fsvcs.length, 1, "getServices must return exactly one TemperatureSensor service");
  var cxs = fsvcs[0].characteristics.filter(function(cx){ return cx.UUID === Characteristic.CurrentTemperature.UUID; });
  assert.equal(cxs.length, 1, "The TemperatureSensor service must have exactly one CurrentTemperature Characteristic");

  fsvcs = services.filter(function(service){ return service.UUID === Service.Outlet.UUID; });
  assert.equal(fsvcs.length, 1, "getServices must return exactly one Outlet service");
  var cxs = fsvcs[0].characteristics.filter(function(cx){ return cx.UUID === Characteristic.On.UUID; });
  assert.equal(cxs.length, 1, "The Outlet service must have exactly one On Characteristic");
  var cxs = fsvcs[0].characteristics.filter(function(cx){ return cx.UUID === ZWayServerPlatform.CurrentPowerConsumption.UUID; });
  assert.equal(cxs.length, 1, "The Outlet service must have exactly one CurrentPowerConsumption Characteristic");
  var cxs = fsvcs[0].characteristics.filter(function(cx){ return cx.UUID === ZWayServerPlatform.TotalPowerConsumption.UUID; });
  assert.equal(cxs.length, 1, "The Outlet service must have exactly one TotalPowerConsumption Characteristic");
});
