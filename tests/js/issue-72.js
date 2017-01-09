var homebridge = require("../../node_modules/homebridge/lib/api.js");

test("Issue 72", function() {
  var api = new homebridge.API();
  _initializer(api);
  var Service = api.hap.Service;
  var Characteristic = api.hap.Characteristic;
  var devicesJson = {"data":{"structureChanged":true,"updateTime":1483686127,"devices":[
    {
      "creationTime":1481040700,
      "creatorId":1,
      "deviceType":"switchMultilevel",
      "h":732948197,
      "hasHistory":false,
      "id":"ZWayVDev_zway_180-0-38",
      "location":1,
      "metrics":{
        "icon":"blinds",
        "title":"Blind (180.0)",
        "level":0
      },
      "permanently_hidden":false,
      "probeType":"motor",
      "tags":[],
      "visibility":true,
      "updateTime":1483686091
    }
  ]},"code":200,"message":"200 OK","error":null};
  var testPlatform = new platform({}, console.log);
  var foundAccessories = testPlatform.buildAccessoriesFromJson(devicesJson);
  assert.equal(foundAccessories.length, 1, "buildAccessoriesFromJson must find exactly one accessory.");
  var acc = new accessory(foundAccessories[0].name, foundAccessories[0].devDesc, testPlatform);
  var services = acc.getServices();
  assert.equal(services.length, 2, "getServices must return two services.");
  //console.log(JSON.stringify(services[1].characteristics, null, 4));
  var wcServices = services.filter(function(service){ return service.UUID === Service.WindowCovering.UUID; });
  assert.equal(wcServices.length, 1, "getServices must return exactly one WindowCovering service");
  var tpCxs = wcServices[0].characteristics.filter(function(cx){ return cx.UUID === Characteristic.TargetPosition.UUID; });
  assert.equal(tpCxs.length, 1, "The WindowCovering service must have exactly one TargetPosition Characteristic");
  assert.strictEqual(tpCxs[0].props['maxValue'], 100, "The TargetPosition Characteristic must equal numeric 100");
});
