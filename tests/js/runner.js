var qunit = require("qunit");
homebridge = require("../../node_modules/homebridge/lib/api.js");

qunit.options.coverage = { dir: "/tmp/" };

qunit.run({
  code : "index.js",
  tests : [
    'switchBinary',
    'issue-72.js'
  ].map(function (v) { return './tests/js/' + v; })
});
