test("Issue 72", function() {
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
  console.log(acc.getVDevServices(acc.getServices()));
});
