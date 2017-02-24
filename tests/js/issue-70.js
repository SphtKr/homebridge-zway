var homebridge = require("../../node_modules/homebridge/lib/api.js");

var api = new homebridge.API();
_initializer(api);
var testPlatform = new platform({}, console.log);
var Service = api.hap.Service;
var Characteristic = api.hap.Characteristic;

test("Issue 70 hang", function() {
  var devicesJson = require('../data/issue-70.json');
  var foundAccessories = testPlatform.buildAccessoriesFromJson(devicesJson);
  assert.equal(foundAccessories.length, 23, "buildAccessoriesFromJson must find 23 accessories.");
  var accessories = [], dnames = {};
  for(var i = 0; i < foundAccessories.length; i++){
    accessories[i] = new accessory(foundAccessories[i].name, foundAccessories[i].devDesc, testPlatform);
    var dname = accessories[i].name;
    assert.ok(!dnames[dname], "No duplicate displayName " + foundAccessories[i].displayName + "");
    dnames[dname] = accessories[i];
  }
});
