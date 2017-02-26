var qunit = require("qunit");
homebridge = require("../../node_modules/homebridge/lib/api.js");

qunit.options.coverage = { dir: "/tmp/" };

qunit.run({
  code : "index.js",
  tests : [
    'switchBinary',
    'issue-48.js',
    'issue-69.js',
    'issue-72.js',
    'issue-70.js',
    'update-without-change.js'
  ].map(function (v) { return './tests/js/' + v; })
});
