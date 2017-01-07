var qunit = require("qunit");
var homebridge = require("homebridge");
var Service = homebridge.hap.Service;
var Characteristic = homebridge.hap.Characteristic;

qunit.run({
  code : "index.js",
  tests : [
    'issue-72.js'
  ].map(function (v) { return './tests/js/' + v; })
});
