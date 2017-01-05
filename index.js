var inherits = require('util').inherits;
var debug = require('debug')('ZWayServer');
var Service;// = require("../api").homebridge.hap.Service;
var Characteristic;// = require("../api").homebridge.hap.Characteristic;
//var types = require("../api").homebridge.hapLegacyTypes;
var request = require("request");
var tough = require('tough-cookie');
var Q = require("q");

function ZWayServerPlatform(log, config){
    this.log          = log;
    this.url          = config["url"];
    this.login        = config["login"];
    this.password     = config["password"];
    this.opt_in       = config["opt_in"];
    this.name_overrides = config["name_overrides"];
    this.batteryLow   = config["battery_low_level"] || 15;
    this.OIUWatts     = config["outlet_in_use_level"] || 2;
    this.pollInterval = config["poll_interval"] || 2;
    this.splitServices= config["split_services"] === undefined ? true : config["split_services"];
    this.dimmerOffThreshold = config["dimmer_off_threshold"] === undefined ? 5 : config["dimmer_off_threshold"];
    this.lastUpdate   = 0;
    this.cxVDevMap    = {};
    this.vDevStore    = {};
    this.sessionId = "";
    this.jar = request.jar(new tough.CookieJar());
}


module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    ZWayServerPlatform.CurrentPowerConsumption = function() {
      Characteristic.call(this, 'Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52');
      this.setProps({
        format: Characteristic.Formats.UINT16,
        unit: "watts",
        maxValue: 1000000000,
        minValue: 0,
        minStep: 1,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
      });
      this.value = this.getDefaultValue();
    };
    ZWayServerPlatform.CurrentPowerConsumption.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52';
    inherits(ZWayServerPlatform.CurrentPowerConsumption, Characteristic);

    ZWayServerPlatform.TotalPowerConsumption = function() {
      Characteristic.call(this, 'Total Consumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52');
      this.setProps({
        format: Characteristic.Formats.FLOAT, // Deviation from Eve Energy observed type
        unit: "kilowatthours",
        maxValue: 1000000000,
        minValue: 0,
        minStep: 0.001,
        perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
      });
      this.value = this.getDefaultValue();
    };
    ZWayServerPlatform.TotalPowerConsumption.UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52';
    inherits(ZWayServerPlatform.TotalPowerConsumption, Characteristic);

    ZWayServerPlatform.ServiceUUIDReverseLookupMap = {};
    for(var serviceKey in Service) if(Service[serviceKey].UUID != undefined)
        ZWayServerPlatform.ServiceUUIDReverseLookupMap[Service[serviceKey].UUID] = serviceKey;
    for(var serviceKey in ZWayServerPlatform) if(ZWayServerPlatform[serviceKey].UUID != undefined)
        ZWayServerPlatform.ServiceUUIDReverseLookupMap[ZWayServerPlatform[serviceKey].UUID] = serviceKey;

    ZWayServerAccessory.prototype.extraCharacteristicsMap = {
        "battery.Battery": [Characteristic.BatteryLevel, Characteristic.StatusLowBattery],
        "sensorMultilevel.Temperature": [Characteristic.CurrentTemperature, Characteristic.TemperatureDisplayUnits],
        "sensorMultilevel.Humidity": [Characteristic.CurrentRelativeHumidity],
        "sensorMultilevel.Luminiscence": [Characteristic.CurrentAmbientLightLevel],
        "sensorMultilevel.meterElectric_watt": [ZWayServerPlatform.CurrentPowerConsumption],
        "sensorMultilevel.meterElectric_kilowatt_per_hour": [ZWayServerPlatform.TotalPowerConsumption]
    }

    homebridge.registerAccessory("homebridge-zway", "ZWayServer", ZWayServerAccessory);
    homebridge.registerPlatform("homebridge-zway", "ZWayServer", ZWayServerPlatform);
}

ZWayServerPlatform.getVDevTypeKeyNormalizationMap = {
    "sensorBinary.general_purpose": "sensorBinary.General purpose",
    "sensorBinary.alarm_burglar": "sensorBinary",
    "sensorBinary.door": "sensorBinary.Door/Window",
    "sensorBinary.door-window": "sensorBinary.Door/Window",
    "sensorBinary.tamper": "sensorBinary.Tamper",
    "sensorMultilevel.temperature": "sensorMultilevel.Temperature",
    "sensorMultilevel.luminosity": "sensorMultilevel.Luminiscence",
    "sensorMultilevel.humidity": "sensorMultilevel.Humidity",
    "switchMultilevel.dimmer": "switchMultilevel",
    "switchRGBW.switchColor_undefined": "switchRGBW",
    "switchRGBW.switchColor_rgb": "switchRGBW",
    "switchMultilevel.multilevel": "switchMultilevel",
    "switchMultilevel.switchColor_soft_white": "switchMultilevel",
    "switchMultilevel.switchColor_cold_white": "switchMultilevel",
    "switchMultilevel.motor": "switchMultilevel.blind",
    "thermostat.thermostat_set_point": "thermostat",
    "battery": "battery.Battery"
}
ZWayServerPlatform.getVDevTypeKeyRoot = function(vdev){
    var key = vdev.deviceType;
    var overrideDeviceType, overrideProbeType;
    if(overrideDeviceType = ZWayServerPlatform.prototype.getTagValue(vdev, "Override.deviceType")){
        // NOTE: This feature should be considered UNDOCUMENTED and UNSUPPORTED and
        // may be removed at any time without notice. It should not be used in normal
        // circumstances. If you find this useful, you must submit an issue with a
        // use-case justification, at which point it may be considered to be supported
        // as a feature. Improper use may seriously interfere with proper functioning
        // of Homebridge or the ZWayServer platform!
        key = overrideDeviceType;
    }
    return key;
}
ZWayServerPlatform.getVDevTypeKey = function(vdev){
    /* At present we normalize these values down from 2.2 nomenclature to 2.0
       nomenclature. At some point, this should be reversed. */
    var nmap = ZWayServerPlatform.getVDevTypeKeyNormalizationMap;
    var key = ZWayServerPlatform.getVDevTypeKeyRoot(vdev);
    if(overrideProbeType = ZWayServerPlatform.prototype.getTagValue(vdev, "Override.probeType")){
        // NOTE: While this is supported, it is intended to only be used by "Code
        // Devices" and "HTTP Devices" or other custom/unusual device types, and
        // should not be required or used in most other circumstances. Improper
        // use may seriously interfere with proper functioning of Homebridge or
        // the ZWayServer platform!
        key += "." + overrideProbeType;
    } else if(vdev.metrics && vdev.metrics.probeTitle == 'Electric'){
        // We need greater specificity given by probeType, so override the
        // v2.0-favoring logic for this specific case...
        key += "." + vdev.probeType;
    } else if(vdev.metrics && vdev.metrics.probeTitle){
        key += "." + vdev.metrics.probeTitle;
    } else if(vdev.probeType){
        key += "." + vdev.probeType;
    }
    return nmap[key] || key;
}

ZWayServerPlatform.prototype = {

    zwayRequest: function(opts){
        var that = this;
        var deferred = Q.defer();

        opts.jar = true;//this.jar;
        opts.json = true;
        opts.headers = {
            "Cookie": "ZWAYSession=" + this.sessionId
        };

        request(opts, function(error, response, body){
            if(response && response.statusCode == 401){
                debug("Authenticating...");
                request({
                    method: "POST",
                    url: that.url + 'ZAutomation/api/v1/login',
                    body: { //JSON.stringify({
                        "form": true,
                        "login": that.login,
                        "password": that.password,
                        "keepme": false,
                        "default_ui": 1
                    },
                    headers: {
                        "Accept": "application/json",
                        "Content-Type": "application/json"
                    },
                    json: true,
                    jar: true//that.jar
                }, function(error, response, body){
                    if(response && response.statusCode == 200){
                        that.sessionId = body.data.sid;
                        opts.headers["Cookie"] = "ZWAYSession=" + that.sessionId;
                        debug("Authenticated. Resubmitting original request...");
                        request(opts, function(error, response, body){
                            if(response.statusCode == 200){
                                deferred.resolve(body);
                            } else {
                                deferred.reject(response);
                            }
                        });
                    } else if(response && response.statusCode == 401){
                        that.log("ERROR: Fatal! Authentication failed (error code 401)! Check the username and password in config.json!");
                        deferred.reject(response);
                    } else {
                        that.log("ERROR: Fatal! Authentication failed with unexpected HTTP response code " + response.statusCode + "!");
                        deferred.reject(response);
                    }
                });
            } else if(response && response.statusCode == 200) {
                deferred.resolve(body);
            } else {
                that.log("ERROR: Request failed! "
                  + (response ? "HTTP response code " + response.statusCode + ". " : "")
                  + (error ? "Error code " + error.code + ". " : "")
                  + "Check the URL in config.json and ensure that the URL can be reached from this system!");
                if(response) debug(response); else debug(error);
                deferred.reject(response);
            }
        });
        return deferred.promise;
    }
    ,
    getTagValue: function(vdev, tagStem){
        if(!(vdev.tags && vdev.tags.length > 0)) return false;
        var tagStem = "Homebridge." + tagStem;
        if(vdev.tags.indexOf(tagStem) >= 0) return true;
        var tags = vdev.tags, l = tags.length, tag;
        for(var i = 0; i < l; i++){
            tag = tags[i];
            if(tag.indexOf(tagStem + ":") === 0){
                return tag.substr(tagStem.length + 1);
            }
        }
        return false;
    }
    ,
    isVDevBridged: function(vdev){
        var isBridged;
        var isTaggedSkip = this.getTagValue(vdev, "Skip");
        var isTaggedInclude  = this.getTagValue(vdev, "Include");

        if(this.opt_in) isBridged = false; else isBridged = true; // Start with the initial bias
        if(vdev.permanently_hidden) isBridged = false;
        if(isTaggedInclude) isBridged = true; // Include overrides permanently_hidden
        if(isTaggedSkip) isBridged = false; // Skip overrides Include...
        if(this.opt_in && isTaggedInclude) isBridged = true; // ...unless we're in opt_in mode, where Include always wins.

        if(!isBridged && !this.opt_in){
            debug("Device " + vdev.id + " skipped! ");
            debug({"permanently_hidden": vdev.permanently_hidden, "Skip": isTaggedSkip, "Include": isTaggedInclude, "opt_in": this.opt_in});
        }
        return isBridged;
    }
    ,
    accessories: function(callback) {
        debug("Fetching Z-Way devices...");

        //TODO: Unify this with getVDevServices, so there's only one place with mapping between service and vDev type.
        //Note: Order matters!
        var primaryDeviceClasses = [
            "doorlock",
            "thermostat",
            "switchMultilevel.blind",
            "switchMultilevel",
            "switchBinary",
            "sensorBinary.alarm_smoke",
            "sensorBinary.Door/Window",
            "sensorBinary.alarmSensor_flood",

            // | Possible regression, this couldn't become a primary before, but it's needed for some LeakSensors...
            // v But now a "sensorBinary.General purpose" can become primary... Bug or Feature?
            "sensorBinary.General purpose",

            "sensorMultilevel.Temperature",
            "sensorMultilevel.Humidity"
        ];

        var that = this;
        var foundAccessories = [];

        this.zwayRequest({
            method: "GET",
            url: this.url + 'ZAutomation/api/v1/devices'
        }).then(function(result){
            this.lastUpdate = result.data.updateTime;

            var devices = result.data.devices;
            var groupedDevices = {};
            for(var i = 0; i < devices.length; i++){
                var vdev = devices[i];

                if(!this.isVDevBridged(vdev)) continue;

                var gdid = this.getTagValue(vdev, "Accessory.Id");
                if(!gdid){
                    gdid = vdev.id.replace(/^(.*?)_zway_(\d+-\d+)-\d.*/, '$1_$2');
                }

                var gd = groupedDevices[gdid] || (groupedDevices[gdid] = { devices: [], types: {}, extras: {}, primary: undefined, cxmap: {} });

                gd.devices.push(vdev);
                var vdevIndex = gd.devices.length - 1;

                var tk = ZWayServerPlatform.getVDevTypeKey(vdev);

                // If this is explicitly set as primary, set it now...
                if(this.getTagValue(vdev, "IsPrimary")){
                    // everybody out of the way! Can't be in "extras" if you're the primary...
                    if(gd.types[tk] !== undefined){
                        gd.extras[tk] = gd.extras[tk] || [];
                        gd.extras[tk].push(gd.types[tk]);
                        delete gd.types[tk]; // clear the way for this one to be set here below...
                    }
                    gd.primary = vdevIndex;
                    //gd.types[tk] = gd.primary;
                }

                if(gd.types[tk] === undefined){
                    gd.types[tk] = vdevIndex;
                } else {
                    gd.extras[tk] = gd.extras[tk] || [];
                    gd.extras[tk].push(vdevIndex);
                }
                var tkroot = ZWayServerPlatform.getVDevTypeKeyRoot(vdev);
                if(tk !== tkroot) gd.types[tkroot] = vdevIndex; // also include the deviceType only as a possibility

                // Create a map entry when Homebridge.Characteristic.Type is set...
                var ctype = this.getTagValue(vdev, "Characteristic.Type");
                if(ctype && Characteristic[ctype]){
                    var cx = new Characteristic[ctype]();
                    gd.cxmap[cx.UUID] = vdevIndex;
                }
            }

            for(var gdid in groupedDevices) {
                if(!groupedDevices.hasOwnProperty(gdid)) continue;

                // Debug/log...
                debug('Got grouped device ' + gdid + ' consisting of devices:');
                var gd = groupedDevices[gdid];
                for(var j = 0; j < gd.devices.length; j++){
                    debug(gd.devices[j].id + " - " + gd.devices[j].deviceType + (gd.devices[j].metrics && gd.devices[j].metrics.probeTitle ? "." + gd.devices[j].metrics.probeTitle : ""));
                }

                var accessory = null;
                if(gd.primary !== undefined){
                    var pd = gd.devices[gd.primary];
                    var name = pd.metrics && pd.metrics.title ? pd.metrics.title : pd.id;
                    accessory = new ZWayServerAccessory(name, gd, that);
                }
                else for(var ti = 0; ti < primaryDeviceClasses.length; ti++){
                    if(gd.types[primaryDeviceClasses[ti]] !== undefined){
                        gd.primary = gd.types[primaryDeviceClasses[ti]];
                        var pd = gd.devices[gd.primary];
                        var name = pd.metrics && pd.metrics.title ? pd.metrics.title : pd.id;
                        //debug("Using primary device with type " + primaryDeviceClasses[ti] + ", " + name + " (" + pd.id + ") as primary.");
                        accessory = new ZWayServerAccessory(name, gd, that);
                        break;
                    }
                }

                if(!accessory)
                    debug("WARN: Didn't find suitable device class!");
                else
                    foundAccessories.push(accessory);

            }
            callback(foundAccessories);

            // Start the polling process...
            this.pollingTimer = setTimeout(this.pollUpdate.bind(this), this.pollInterval*1000);

        }.bind(this));

    }
    ,

    pollUpdate: function(){
        //debug("Polling for updates since " + this.lastUpdate + "...");
        return this.zwayRequest({
            method: "GET",
            url: this.url + 'ZAutomation/api/v1/devices',
            qs: {since: this.lastUpdate}
        }).then(function(result){
            this.lastUpdate = result.data.updateTime;
            if(result.data && result.data.devices && result.data.devices.length){
                var updates = result.data.devices;
                debug("Got " + updates.length + " updates.");
                for(var i = 0; i < updates.length; i++){
                    var upd = updates[i];
                    if(this.cxVDevMap[upd.id]){
                        var vdev = this.vDevStore[upd.id];
                        vdev.metrics.level = upd.metrics.level;
                        if(upd.metrics.color){
                            vdev.metrics.r = upd.metrics.r;
                            vdev.metrics.g = upd.metrics.g;
                            vdev.metrics.b = upd.metrics.b;
                        }
                        vdev.updateTime = upd.updateTime;
                        var cxs = this.cxVDevMap[upd.id];
                        for(var j = 0; j < cxs.length; j++){
                            var cx = cxs[j];
                            if(typeof cx.zway_getValueFromVDev !== "function") continue;
                            var oldValue = cx.value;
                            var newValue = cx.zway_getValueFromVDev(vdev);
                            if(oldValue !== newValue){
                                cx.value = newValue;
                                cx.emit('change', { oldValue:oldValue, newValue:cx.value, context:null });
                                debug("Updated characteristic " + cx.displayName + " on " + vdev.metrics.title);
                            }
                        }
                    }
                }
            }

        }.bind(this))
        .fin(function(){
            // setup next poll...
            this.pollingTimer = setTimeout(this.pollUpdate.bind(this), this.pollInterval*1000);
        }.bind(this));
    }

}

function ZWayServerAccessory(name, devDesc, platform) {
  // device info
  this.name     = name;
  this.devDesc  = devDesc;
  this.platform = platform;
  this.log      = platform.log;
}


ZWayServerAccessory.prototype = {

    getVDev: function(vdev){
        return this.platform.zwayRequest({
            method: "GET",
            url: this.platform.url + 'ZAutomation/api/v1/devices/' + vdev.id
        })//.then(function());
    }
    ,
    command: function(vdev, command, value) {
        return this.platform.zwayRequest({
            method: "GET",
            url: this.platform.url + 'ZAutomation/api/v1/devices/' + vdev.id + '/command/' + command,
            qs: (value === undefined ? undefined : value)
        });
    }
    ,
    isInterlockOn: function(){
        return !!this.interlock && !!this.interlock.value;
    }
    ,
    rgb2hsv: function(obj) {
        // RGB: 0-255; H: 0-360, S,V: 0-100
        var r = obj.r/255, g = obj.g/255, b = obj.b/255;
        var max, min, d, h, s, v;

        min = Math.min(r, Math.min(g, b));
        max = Math.max(r, Math.max(g, b));

        if (min === max) {
            // shade of gray
            return {h: 0, s: 0, v: r * 100};
        }

        var d = (r === min) ? g - b : ((b === min) ? r - g : b - r);
        h = (r === min) ? 3 : ((b === min) ? 1 : 5);
        h = 60 * (h - d/(max - min));
        s = (max - min) / max;
        v = max;
        return {"h": h, "s": s * 100, "v": v * 100};
    }
    ,
    hsv2rgb: function(obj) {
        // H: 0-360; S,V: 0-100; RGB: 0-255
        var r, g, b;
        var sfrac = obj.s / 100;
        var vfrac = obj.v / 100;

        if(sfrac === 0){
            var vbyte = Math.round(vfrac*255);
            return { r: vbyte, g: vbyte, b: vbyte };
        }

        var hdb60 = (obj.h % 360) / 60;
        var sector = Math.floor(hdb60);
        var fpart = hdb60 - sector;
        var c = vfrac * (1 - sfrac);
        var x1 = vfrac * (1 - sfrac * fpart);
        var x2 = vfrac * (1 - sfrac * (1 - fpart));
        switch(sector){
            case 0:
                r = vfrac; g = x2;    b = c;      break;
            case 1:
                r = x1;    g = vfrac; b = c;      break;
            case 2:
                r = c;     g = vfrac; b = x2;     break;
            case 3:
                r = c;     g = x1;    b = vfrac;  break;
            case 4:
                r = x2;    g = c;     b = vfrac;  break;
            case 5:
            default:
                r = vfrac; g = c;     b = x1;     break;
        }

        return { "r": Math.round(255 * r), "g": Math.round(255 * g), "b": Math.round(255 * b) };
    }
    ,
    getVDevServices: function(vdev){
        var typeKey = ZWayServerPlatform.getVDevTypeKey(vdev);
        //TODO: Make a second pass through the below logic with the root typeKey, but
        // only allow it to be used if Service.Type tag is set, at a minimum...dangerous!
        var services = [], service;
        switch (typeKey) {
            case "thermostat":
                services.push(new Service.Thermostat(vdev.metrics.title, vdev.id));
                break;
            case "switchBinary":
                if(this.platform.getTagValue(vdev, "Service.Type") === "Lightbulb"){
                    services.push(new Service.Lightbulb(vdev.metrics.title, vdev.id));
                } else if(this.platform.getTagValue(vdev, "Service.Type") === "Outlet"){
                    services.push(new Service.Outlet(vdev.metrics.title, vdev.id));
                } else if(this.platform.getTagValue(vdev, "Service.Type") === "WindowCovering"){
                    services.push(new Service.WindowCovering(vdev.metrics.title, vdev.id));
                } else {
                    services.push(new Service.Switch(vdev.metrics.title, vdev.id));
                }
                break;
            case "switchRGBW":
            case "switchMultilevel":
                if(this.platform.getTagValue(vdev, "Service.Type") === "Switch"){
                    services.push(new Service.Switch(vdev.metrics.title, vdev.id));
                } else if(this.platform.getTagValue(vdev, "Service.Type") === "WindowCovering"){
                    services.push(new Service.WindowCovering(vdev.metrics.title, vdev.id));
                } else {
                    services.push(new Service.Lightbulb(vdev.metrics.title, vdev.id));
                }
                break;
            case "switchMultilevel.blind":
                services.push(new Service.WindowCovering(vdev.metrics.title, vdev.id));
                break;
            case "sensorBinary.Door/Window":
            case "sensorBinary.alarm_door":
                var stype = this.platform.getTagValue(vdev, "Service.Type");
                if(stype === "ContactSensor"){
                    services.push(new Service.ContactSensor(vdev.metrics.title, vdev.id));
                } else if(stype === "GarageDoorOpener"){
                    services.push(new Service.GarageDoorOpener(vdev.metrics.title, vdev.id));
                } else if(stype === "Window"){
                    services.push(new Service.Window(vdev.metrics.title, vdev.id));
                } else {
                    services.push(new Service.Door(vdev.metrics.title, vdev.id));
                }
                break;
            case "sensorBinary.alarm_smoke":
                services.push(new Service.SmokeSensor(vdev.metrics.title, vdev.id));
                break;
            case "sensorMultilevel.Temperature":
                services.push(new Service.TemperatureSensor(vdev.metrics.title, vdev.id));
                break;
            case "sensorMultilevel.Humidity":
                services.push(new Service.HumiditySensor(vdev.metrics.title, vdev.id));
                break;
            case "battery.Battery":
                services.push(new Service.BatteryService(vdev.metrics.title, vdev.id));
                break;
            case "sensorMultilevel.Luminiscence":
                services.push(new Service.LightSensor(vdev.metrics.title, vdev.id));
                break;
            case "sensorBinary":
            case "sensorBinary.General purpose":
                var stype = this.platform.getTagValue(vdev, "Service.Type");
                if(stype === "MotionSensor"){
                    services.push(new Service.MotionSensor(vdev.metrics.title, vdev.id));
                } else if(stype === "LeakSensor") {
                    services.push(new Service.LeakSensor(vdev.metrics.title, vdev.id));
                } else {
                    services.push(new Service.ContactSensor(vdev.metrics.title, vdev.id));
                }
                break;
            case "sensorBinary.alarmSensor_flood":
                services.push(new Service.LeakSensor(vdev.metrics.title, vdev.id));
                break;
            case "doorlock":
                services.push(new Service.LockMechanism(vdev.metrics.title, vdev.id));
                break;
            case "sensorMultilevel.meterElectric_watt":
                services.push(new Service.Outlet(vdev.metrics.title, vdev.id));
        }

        var validServices =[];
        for(var i = 0; i < services.length; i++){
            if(this.configureService(services[i], vdev)){
                validServices.push(services[i]);
                debug('Found and configured Service "' + ZWayServerPlatform.ServiceUUIDReverseLookupMap[services[i].UUID] + '" for vdev "' + vdev.id + '" with typeKey "' + typeKey + '"')
            } else {
                debug('WARN: Failed to configure Service "' + ZWayServerPlatform.ServiceUUIDReverseLookupMap[services[i].UUID] + '" for vdev "' + vdev.id + '" with typeKey "' + typeKey + '"')
            }
        }
        return validServices;
    }
    ,
    uuidToTypeKeyMap: null
    ,
    extraCharacteristicsMap: {
        // moved to module.exports where Characteristic prototype is available...
    }
    ,
    getVDevForCharacteristic: function(cx, vdevPreferred){

        // If we know which vdev should be used for this Characteristic, we're done!
        if(this.devDesc.cxmap[cx.UUID] !== undefined){
           return this.devDesc.devices[this.devDesc.cxmap[cx.UUID]];
        }

        var map = this.uuidToTypeKeyMap;
        if(!map){
            this.uuidToTypeKeyMap = map = {};
            map[(new Characteristic.On).UUID] = ["switchBinary","switchMultilevel"];
            map[(new Characteristic.OutletInUse).UUID] = ["sensorMultilevel.meterElectric_watt","switchBinary"];
            map[(new Characteristic.Brightness).UUID] = ["switchMultilevel"];
            map[(new Characteristic.Hue).UUID] = ["switchRGBW"];
            map[(new Characteristic.Saturation).UUID] = ["switchRGBW"];
            map[(new Characteristic.CurrentTemperature).UUID] = ["sensorMultilevel.Temperature","thermostat"];
            map[(new Characteristic.CurrentRelativeHumidity).UUID] = ["sensorMultilevel.Humidity"];
            map[(new Characteristic.TargetTemperature).UUID] = ["thermostat"];
            map[(new Characteristic.TemperatureDisplayUnits).UUID] = ["sensorMultilevel.Temperature","thermostat"]; //TODO: Always a fixed result
            map[(new Characteristic.CurrentHeatingCoolingState).UUID] = ["thermostat"]; //TODO: Always a fixed result
            map[(new Characteristic.TargetHeatingCoolingState).UUID] = ["thermostat"]; //TODO: Always a fixed result
            map[(new Characteristic.CurrentDoorState).UUID] = ["sensorBinary.Door/Window","sensorBinary"];
            map[(new Characteristic.TargetDoorState).UUID] = ["sensorBinary.Door/Window","sensorBinary"]; //TODO: Always a fixed result
            map[(new Characteristic.ContactSensorState).UUID] = ["sensorBinary","sensorBinary.Door/Window"]; //NOTE: A root before a full...what we want?
            map[(new Characteristic.LeakDetected).UUID] = ["sensorBinary.alarmSensor_flood","sensorBinary.General purpose","sensorBinary"];
            map[(new Characteristic.CurrentPosition).UUID] = ["sensorBinary.Door/Window","switchMultilevel.blind","switchBinary.motor","sensorBinary","switchMultilevel","switchBinary"]; // NOTE: switchBinary.motor may not exist...guessing?
            map[(new Characteristic.TargetPosition).UUID] = ["sensorBinary.Door/Window","switchMultilevel.blind","switchBinary.motor","sensorBinary","switchMultilevel","switchBinary"]; // NOTE: switchBinary.motor may not exist...guessing?
            map[(new Characteristic.PositionState).UUID] = ["sensorBinary.Door/Window","switchMultilevel.blind","switchBinary.motor","sensorBinary","switchMultilevel","switchBinary"]; // NOTE: switchBinary.motor may not exist...guessing?
            map[(new Characteristic.HoldPosition).UUID] = ["switchMultilevel.blind","switchBinary.motor","switchMultilevel"]; // NOTE: switchBinary.motor may not exist...guessing?
            map[(new Characteristic.ObstructionDetected).UUID] = ["sensorBinary.Door/Window","sensorBinary"]; //TODO: Always a fixed result
            map[(new Characteristic.SmokeDetected).UUID] = ["sensorBinary.alarm_smoke","sensorBinary.alarm_heat"];
            map[(new Characteristic.BatteryLevel).UUID] = ["battery.Battery"];
            map[(new Characteristic.StatusLowBattery).UUID] = ["battery.Battery"];
            map[(new Characteristic.ChargingState).UUID] = ["battery.Battery"]; //TODO: Always a fixed result
            map[(new Characteristic.CurrentAmbientLightLevel).UUID] = ["sensorMultilevel.Luminiscence"];
            map[(new Characteristic.LockCurrentState).UUID] = ["doorlock"];
            map[(new Characteristic.LockTargetState).UUID] = ["doorlock"];
            map[(new Characteristic.StatusTampered).UUID] = ["sensorBinary.Tamper"];
            map[(new ZWayServerPlatform.CurrentPowerConsumption).UUID] = ["sensorMultilevel.meterElectric_watt"];
            map[(new ZWayServerPlatform.TotalPowerConsumption).UUID] = ["sensorMultilevel.meterElectric_kilowatt_per_hour"];
        }

        if(cx instanceof Characteristic.Name) return vdevPreferred;

        // Special cases! Ignore the preferred device when...
        // If cx is a CurrentTemperature, we want the sensor if available.
        if(cx instanceof Characteristic.CurrentTemperature) vdevPreferred = null;
        // If cx is OutletInUse, we want the power meter if available over the switch.
        if(cx instanceof Characteristic.OutletInUse) vdevPreferred = null;
        //

        var typekeys = map[cx.UUID];
        if(typekeys === undefined) return null;

        //NOTE: We do NOT want to try the root key here, because there may be a better
        // match in another VDev...the preference doesn't extend to non-optimal matches.
        if(vdevPreferred && typekeys.indexOf(ZWayServerPlatform.getVDevTypeKey(vdevPreferred)) >= 0){
            return vdevPreferred;
        }

        var candidates = this.devDesc.devices;
        for(var i = 0; i < typekeys.length; i++){
            for(var j = 0; j < candidates.length; j++){
                if(ZWayServerPlatform.getVDevTypeKey(candidates[j]) === typekeys[i]) return candidates[j];
                // Also try the "root" key, e.g. sensorBinary vs. sensorBinary.general_purpose ...
                if(ZWayServerPlatform.getVDevTypeKeyRoot(candidates[j]) === typekeys[i]) return candidates[j];
            }
        }
        return null;
    }
    ,
    configureCharacteristic: function(cx, vdev, service){
        var accessory = this;

        // Add this combination to the maps...
        if(!this.platform.cxVDevMap[vdev.id]) this.platform.cxVDevMap[vdev.id] = [];
        this.platform.cxVDevMap[vdev.id].push(cx);
        if(!this.platform.vDevStore[vdev.id]) this.platform.vDevStore[vdev.id] = vdev;

        var interlock = function(fnDownstream){
            return function(newval, callback){
                if(this.isInterlockOn()){
                    callback(new Error("Interlock is on! Changes locked out!"));
                } else {
                    fnDownstream(newval, callback);
                }
            }.bind(accessory);
        };

        if(cx instanceof Characteristic.Name){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.title;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, accessory.name);
            });
            return cx;
        }

        // We don't want to override "Name"'s name...so we just move this below that block.
        var descOverride = this.platform.getTagValue(vdev, "Characteristic.Description");
        if(descOverride){
            cx.displayName = descOverride;
        }

        if(cx instanceof Characteristic.On){
            cx.zway_getValueFromVDev = function(vdev){
                var val = false;
                if(vdev.metrics.level === "on"){
                    val = true;
                } else if(vdev.metrics.level <= accessory.platform.dimmerOffThreshold) {
                    val = false;
                } else if (vdev.metrics.level > accessory.platform.dimmerOffThreshold) {
                    val = true;
                }
                return val;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', interlock(function(powerOn, callback){
                this.command(vdev, powerOn ? "on" : "off").then(function(result){
                    callback();
                });
            }.bind(this)));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.OutletInUse){
            cx.zway_getValueFromVDev = function(vdev){
                var val = false;
                if(vdev.metrics.level === "on"){
                    val = true;
                } else if(vdev.metrics.level === "off") {
                    val = false;
                } else if (vdev.deviceType === "sensorMultilevel") {
                    var t = this.platform.getTagValue(vdev, "OutletInUse.Level") || this.platform.OIUWatts;
                    if(vdev.metrics.level >= t){
                        val = true;
                    } else {
                        val = false;
                    }
                } else {
                    val = false;
                }
                return val;
            }.bind(this);
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.Brightness){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', interlock(function(level, callback){
                this.command(vdev, "exact", {level: parseInt(level, 10)}).then(function(result){
                    callback();
                });
            }.bind(this)));
            return cx;
        }

        if(cx instanceof Characteristic.Hue){
            cx.zway_getValueFromVDev = function(vdev){
                debug("Derived value " + accessory.rgb2hsv(vdev.metrics.color).h + " for hue.");
                return accessory.rgb2hsv(vdev.metrics.color).h;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', interlock(function(hue, callback){
                var scx = service.getCharacteristic(Characteristic.Saturation);
                var vcx = service.getCharacteristic(Characteristic.Brightness);
                if(!scx || !vcx){
                    debug("Hue without Saturation and Brightness is not supported! Cannot set value!")
                    callback(true, cx.value);
                }
                var rgb = this.hsv2rgb({ h: hue, s: scx.value, v: vcx.value });
                this.command(vdev, "exact", { red: rgb.r, green: rgb.g, blue: rgb.b }).then(function(result){
                    callback();
                });
            }.bind(this)));

            return cx;
        }

        if(cx instanceof Characteristic.Saturation){
            cx.zway_getValueFromVDev = function(vdev){
                debug("Derived value " + accessory.rgb2hsv(vdev.metrics.color).s + " for saturation.");
                return accessory.rgb2hsv(vdev.metrics.color).s;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', interlock(function(saturation, callback){
                var hcx = service.getCharacteristic(Characteristic.Hue);
                var vcx = service.getCharacteristic(Characteristic.Brightness);
                if(!hcx || !vcx){
                    debug("Saturation without Hue and Brightness is not supported! Cannot set value!")
                    callback(true, cx.value);
                }
                var rgb = this.hsv2rgb({ h: hcx.value, s: saturation, v: vcx.value });
                this.command(vdev, "exact", { red: rgb.r, green: rgb.g, blue: rgb.b }).then(function(result){
                    callback();
                });
            }.bind(this)));

            return cx;
        }

        if(cx instanceof Characteristic.SmokeDetected){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level == "on" ? Characteristic.SmokeDetected.SMOKE_DETECTED : Characteristic.SmokeDetected.SMOKE_NOT_DETECTED;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            return cx;
        }

        if(cx instanceof Characteristic.CurrentRelativeHumidity){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.setProps({
                minValue: 0,
                maxValue: 100
            });
            return cx;
        }

        if(cx instanceof Characteristic.CurrentTemperature){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.setProps({
                minValue: vdev.metrics && vdev.metrics.min !== undefined ? vdev.metrics.min : -40,
                maxValue: vdev.metrics && vdev.metrics.max !== undefined ? vdev.metrics.max : 999
            });
            return cx;
        }

        if(cx instanceof Characteristic.TargetTemperature){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', interlock(function(level, callback){
                this.command(vdev, "exact", {level: parseInt(level, 10)}).then(function(result){
                    //debug("Got value: " + result.data.metrics.level + ", for " + vdev.metrics.title + ".");
                    callback();
                });
            }.bind(this)));
            cx.setProps({
                minValue: vdev.metrics && vdev.metrics.min !== undefined ? vdev.metrics.min : 5,
                maxValue: vdev.metrics && vdev.metrics.max !== undefined ? vdev.metrics.max : 40
            });
            return cx;
        }

        if(cx instanceof Characteristic.TemperatureDisplayUnits){
            //TODO: Always in °C for now.
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.TemperatureDisplayUnits.CELSIUS;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, Characteristic.TemperatureDisplayUnits.CELSIUS);
            });
            cx.setProps({
                perms: [Characteristic.Perms.READ]
            });
            return cx;
        }

        if(cx instanceof Characteristic.CurrentHeatingCoolingState){
            //TODO: Always HEAT for now, we don't have an example to work with that supports another function.
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.CurrentHeatingCoolingState.HEAT;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, Characteristic.CurrentHeatingCoolingState.HEAT);
            });
            return cx;
        }

        if(cx instanceof Characteristic.TargetHeatingCoolingState){
            //TODO: Always HEAT for now, we don't have an example to work with that supports another function.
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.TargetHeatingCoolingState.HEAT;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, Characteristic.TargetHeatingCoolingState.HEAT);
            });
            // Hmm... apparently if this is not setable, we can't add a thermostat change to a scene. So, make it writable but a no-op.
            cx.on('set', interlock(function(newValue, callback){
                debug("WARN: Set of TargetHeatingCoolingState not yet implemented, resetting to HEAT!")
                callback(undefined, Characteristic.TargetHeatingCoolingState.HEAT);
            }.bind(this)));
            return cx;
        }

        if(cx instanceof Characteristic.CurrentDoorState){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level === "off" ? Characteristic.CurrentDoorState.CLOSED : Characteristic.CurrentDoorState.OPEN;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.TargetDoorState){
            //TODO: We only support this for Door sensors now, so it's a fixed value.
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.TargetDoorState.CLOSED;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, Characteristic.TargetDoorState.CLOSED);
            });
            cx.setProps({
                perms: [Characteristic.Perms.READ]
            });
            return cx;
        }

        if(cx instanceof Characteristic.ObstructionDetected){
            //TODO: We only support this for Door sensors now, so it's a fixed value.
            cx.zway_getValueFromVDev = function(vdev){
                return false;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, false);
            });
            return cx;
        }

        if(cx instanceof Characteristic.BatteryLevel){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            return cx;
        }

        if(cx instanceof Characteristic.StatusLowBattery){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level <= accessory.platform.batteryLow ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            return cx;
        }

        if(cx instanceof Characteristic.ChargingState){
            //TODO: No known chargeable devices(?), so always return false.
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.ChargingState.NOT_CHARGING;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, Characteristic.ChargingState.NOT_CHARGING);
            });
            return cx;
        }

        if(cx instanceof Characteristic.CurrentAmbientLightLevel){
            cx.zway_getValueFromVDev = function(vdev){
                if(vdev.metrics.scaleTitle === "%"){
                    // Completely unscientific guess, based on test-fit data and Wikipedia real-world lux values.
                    // This will probably change!
                    var lux = 0.0005 * (vdev.metrics.level^3.6);
                    // Bounds checking now done upstream!
                    //if(lux < cx.minimumValue) return cx.minimumValue; if(lux > cx.maximumValue) return cx.maximumValue;
                    return lux;
                } else {
                    return vdev.metrics.level;
                }
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.MotionDetected){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level === "off" ? false : true;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.StatusTampered){
            cx.zway_getValueFromVDev = function(vdev){
                return vdev.metrics.level === "off" ? Characteristic.StatusTampered.NOT_TAMPERED : Characteristic.StatusTampered.TAMPERED;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.ContactSensorState){
            cx.zway_getValueFromVDev = function(vdev){
                var boolval = vdev.metrics.level === "off" ? false : true;
                boolval = accessory.platform.getTagValue(vdev, "ContactSensorState.Invert") ? !boolval : boolval;
                return boolval ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.LeakDetected){
            cx.zway_getValueFromVDev = function(vdev){
                var boolval = vdev.metrics.level === "off" ? false : true;
                return boolval ? Characteristic.LeakDetected.LEAK_DETECTED : Characteristic.LeakDetected.LEAK_NOT_DETECTED;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.CurrentPosition){
            cx.zway_getValueFromVDev = function(vdev){
                var level = vdev.metrics.level;
                if(level === undefined) return 0; // Code devices can sometimes have no defined level??
                if(level == "off") return 0;
                if(level == "on") return 100;
                return level == 99 ? 100 : level;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.TargetPosition){
            cx.zway_getValueFromVDev = function(vdev){
                if(service instanceof Service.WindowCovering){
                    // Whatever we set it to last...right?
                    // NOTE: TargetTemperature doesn't do this...source of feedback issues???
                    if(this.value !== cx.getDefaultValue()) return this.value == 99 ? 100 : this.value;
                    // If we haven't set it, figure out what the current state is and assume that was the target...
                    var level = vdev.metrics.level;
                    if(level === undefined) return 0; // Code devices can sometimes have no defined level??
                    if(level == "off") return 0;
                    if(level == "on") return 100;
                    return level == 99 ? 100 : level;

                }
                // Door or Window sensor, so fixed value...
                return 0;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, cx.zway_getValueFromVDev(vdev));
            });
            cx.on('set', interlock(function(level, callback){
                if(isNaN(vdev.metrics.level)){
                    // ^ Slightly kludgy (but fast) way to figure out if we've got a binary or multilevel device...
                    this.command(vdev, level == 0 ? "off" : "on").then(function(result){
                        //debug("Got value: " + result.data.metrics.level + ", for " + vdev.metrics.title + ".");
                        callback(false);
                    }).catch(function(error){callback(error)});
                } else {
                    // For min and max, send up/down instead of explicit level, see issue #43...
                    var promise;
                    switch (parseInt(level, 10)) {
                        case 0:
                        promise = this.command(vdev, "down");
                        break;
                        case 99:
                        case 100:
                        promise = this.command(vdev, "up");
                        break;
                        default:
                        promise = this.command(vdev, "exact", {level: parseInt(level, 10)})
                    }
                    promise.then(function(result){
                        callback(false);
                    }).catch(function(error){callback(error)});
                }
            }.bind(this)));
            cx.setProps({
                minValue: vdev.metrics && vdev.metrics.min !== undefined ? vdev.metrics.min : 0,
                maxValue: vdev.metrics && (vdev.metrics.max !== undefined || vdev.metrics.max != 99) ? vdev.metrics.max : 100
            });
            return cx;
        }

        if(cx instanceof Characteristic.HoldPosition){
            cx.on('get', function(callback, context){
                debug("WARN: Getting value for read-only HoldPosition Characteristic on " + vdev.metrics.title + "...should this happen?");
                callback(false, null);
            });
            cx.on('set', interlock(function(level, callback){
                this.command(vdev, "stop").then(function(result){
                    //debug("Got value: " + result.data.metrics.level + ", for " + vdev.metrics.title + ".");
                    callback(false);
                }).catch(function(error){callback(error)});
            }.bind(this)));
            return cx;
        }

        if(cx instanceof Characteristic.PositionState){
            // Always return STOPPED, we don't really get status updates from Z-Way...
            cx.zway_getValueFromVDev = function(vdev){
                return Characteristic.PositionState.STOPPED;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                callback(false, cx.zway_getValueFromVDev(vdev));
            });
            return cx;
        }

        if(cx instanceof Characteristic.LockCurrentState){
            cx.zway_getValueFromVDev = function(vdev){
                var val = Characteristic.LockCurrentState.UNKNOWN;
                if(vdev.metrics.level === "open"){
                    val = Characteristic.LockCurrentState.UNSECURED;
                } else if(vdev.metrics.level === "close") {
                    val = Characteristic.LockCurrentState.SECURED;
                }
                return val;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof Characteristic.LockTargetState){
            cx.zway_getValueFromVDev = function(vdev){
                var val = Characteristic.LockTargetState.UNSECURED;
                if(vdev.metrics.level === "open"){
                    val = Characteristic.LockTargetState.UNSECURED;
                } else if(vdev.metrics.level === "closed") {
                    val = Characteristic.LockTargetState.SECURED;
                } else if(vdev.metrics.level === "close") {
                    val = Characteristic.LockTargetState.SECURED;
                }
                debug("Returning LockTargetState of \"" + val + "\" because vdev.metrics.level returned \"" + vdev.metrics.level + "\"");
                return val;
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('set', function(newValue, callback){
                if(newValue === false){
                    newValue = Characteristic.LockTargetState.UNSECURED;
                }
                this.command(vdev, newValue === Characteristic.LockTargetState.UNSECURED ? "open" : "close").then(function(result){
                    callback();
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof ZWayServerPlatform.CurrentPowerConsumption){
            cx.zway_getValueFromVDev = function(vdev){
                // Supposedly units are 0.1W, but by experience it's simply Watts ...?
                return Math.round(vdev.metrics.level);
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }

        if(cx instanceof ZWayServerPlatform.TotalPowerConsumption){
            cx.zway_getValueFromVDev = function(vdev){
                // Supposedly units are 0.001kWh, but by experience it's simply kWh ...?
                return Math.round(vdev.metrics.level*1000.0)/1000.0; //Math.round(vdev.metrics.level);
            };
            cx.value = cx.zway_getValueFromVDev(vdev);
            cx.on('get', function(callback, context){
                debug("Getting value for " + vdev.metrics.title + ", characteristic \"" + cx.displayName + "\"...");
                this.getVDev(vdev).then(function(result){
                    debug("Got value: " + cx.zway_getValueFromVDev(result.data) + ", for " + vdev.metrics.title + ".");
                    callback(false, cx.zway_getValueFromVDev(result.data));
                });
            }.bind(this));
            cx.on('change', function(ev){
                debug("Device " + vdev.metrics.title + ", characteristic " + cx.displayName + " changed from " + ev.oldValue + " to " + ev.newValue);
            });
            return cx;
        }
    }
    ,
    configureService: function(service, vdev){
        var success = true;
        for(var i = 0; i < service.characteristics.length; i++){
            var cx = service.characteristics[i];
            var vdev = this.getVDevForCharacteristic(cx, vdev);
            if(!vdev){
                success = false;
                debug("ERROR! Failed to configure required characteristic \"" + service.characteristics[i].displayName + "\"!");
                return false; // Can't configure this service, don't add it!
            }
            cx = this.configureCharacteristic(cx, vdev, service);
            debug('Configured Characteristic "' + cx.displayName + '" for vdev "' + vdev.id + '"')
        }

        // Special case: for Outlet, we want to add Eve consumption cx's as optional...
        if(service instanceof Service.Outlet){
            service.addOptionalCharacteristic(ZWayServerPlatform.CurrentPowerConsumption);
            service.addOptionalCharacteristic(ZWayServerPlatform.TotalPowerConsumption);
        }

        for(var i = 0; i < service.optionalCharacteristics.length; i++){
            var cx = service.optionalCharacteristics[i];
            var vdev = this.getVDevForCharacteristic(cx, vdev);
            if(!vdev) continue;

            //NOTE: Questionable logic, but if the vdev has already been used for the same
            // characteristic type elsewhere, lets not duplicate it just for the sake of an
            // optional characteristic. This eliminates the problem with RGB+W+W bulbs
            // having the HSV controls shown again, but might have unintended consequences...
            var othercx = null, othercxs = this.platform.cxVDevMap[vdev.id];
            if(othercxs) for(var j = 0; j < othercxs.length; j++) if(othercxs[j].UUID === cx.UUID) othercx = othercxs[j];
            if(othercx)
                continue;

            cx = this.configureCharacteristic(cx, vdev, service);
            try {
                if(cx) service.addCharacteristic(cx);
                debug('Configured Characteristic "' + cx.displayName + '" for vdev "' + vdev.id + '"')
            }
            catch (ex) {
                debug('Adding Characteristic "' + cx.displayName + '" failed with message "' + ex.message + '". This may be expected.');
            }
        }
        return success;
    }
    ,
    getServices: function() {
        var that = this;

        var vdevPrimary = this.devDesc.devices[this.devDesc.primary];
        var accId = this.platform.getTagValue(vdevPrimary, "Accessory.Id");
        if(!accId){
            accId = "VDev-" + vdevPrimary.h; //FIXME: Is this valid?
        }

        var informationService = new Service.AccessoryInformation();

        informationService
                .setCharacteristic(Characteristic.Name, this.name)
                .setCharacteristic(Characteristic.Manufacturer, "Z-Wave.me")
                .setCharacteristic(Characteristic.Model, "Virtual Device (VDev version 1)")
                .setCharacteristic(Characteristic.SerialNumber, accId);

        var services = [informationService];

        services = services.concat(this.getVDevServices(vdevPrimary));
        if(services.length === 1){
            debug("WARN: Only the InformationService was successfully configured for " + vdevPrimary.id + "! No device services available!");
            return services;
        }

        // Interlock specified? Create an interlock control switch...
        if(this.platform.getTagValue(vdevPrimary, "Interlock") && services.length > 1){
            var ilsvc = new Service.Switch("Interlock", vdevPrimary.id + "_interlock");
            ilsvc.setCharacteristic(Characteristic.Name, "Interlock");

            var ilcx = ilsvc.getCharacteristic(Characteristic.On);
            ilcx.value = false; // Going to set this true in a minute...
            ilcx.on('change', function(ev){
                debug("Interlock for device " + vdevPrimary.metrics.title + " changed from " + ev.oldValue + " to " + ev.newValue + "!");
            }.bind(this));

            this.interlock = ilcx;
            services.push(ilsvc);

            ilcx.setValue(true); // Initializes the interlock as on
        }

        // Any extra switchMultilevels? Could be a RGBW+W bulb, add them as additional services...
        if(this.devDesc.extras["switchMultilevel"]) for(var i = 0; i < this.devDesc.extras["switchMultilevel"].length; i++){
            var xvdev = this.devDesc.devices[this.devDesc.extras["switchMultilevel"][i]];
            var xservice = this.getVDevServices(xvdev);
            services = services.concat(xservice);
        }

        if(this.platform.splitServices){
            if(this.devDesc.types["battery.Battery"]){
                services = services.concat(this.getVDevServices(this.devDesc.devices[this.devDesc.types["battery.Battery"]]));
            }

            // Odds and ends...if there are sensors that haven't been used, add services for them...

            var tempSensor = this.devDesc.types["sensorMultilevel.Temperature"] !== undefined ? this.devDesc.devices[this.devDesc.types["sensorMultilevel.Temperature"]] : false;
            if(tempSensor && !this.platform.cxVDevMap[tempSensor.id]){
                services = services.concat(this.getVDevServices(tempSensor));
            }

            var rhSensor = this.devDesc.types["sensorMultilevel.Humidity"] !== undefined ? this.devDesc.devices[this.devDesc.types["sensorMultilevel.Humidity"]] : false;
            if(rhSensor && !this.platform.cxVDevMap[rhSensor.id]){
                services = services.concat(this.getVDevServices(rhSensor));
            }

            var lightSensor = this.devDesc.types["sensorMultilevel.Luminiscence"] !== undefined ? this.devDesc.devices[this.devDesc.types["sensorMultilevel.Luminiscence"]] : false;
            if(lightSensor && !this.platform.cxVDevMap[lightSensor.id]){
                services = services.concat(this.getVDevServices(lightSensor));
            }

            var wattSensor = this.devDesc.types["sensorMultilevel.meterElectric_watt"] !== undefined ? this.devDesc.devices[this.devDesc.types["sensorMultilevel.meterElectric_watt"]] : false;
            if(wattSensor && !this.platform.cxVDevMap[wattSensor.id]){
                services = services.concat(this.getVDevServices(wattSensor));
            }

            //var kWhSensor = this.devDesc.types["sensorMultilevel.meterElectric_kilowatt_per_hour"] !== undefined ? this.devDesc.devices[this.devDesc.types["sensorMultilevel.meterElectric_kilowatt_per_hour"]] : false;
            //if(kWhSensor && !this.platform.cxVDevMap[kWhSensor.id]){
            //    services = services.concat(this.getVDevServices(kWhSensor));
            //}

        } else {
            // Everything outside the primary service gets added as optional characteristics...
            var service = services[1];
            var existingCxUUIDs = {};
            for(var i = 0; i < service.characteristics.length; i++) existingCxUUIDs[service.characteristics[i].UUID] = true;

            for(var i = 0; i < this.devDesc.devices.length; i++){
                var vdev = this.devDesc.devices[i];
                if(this.platform.cxVDevMap[vdev.id]) continue; // Don't double-use anything
                //NOTE: Currently no root keys in the map...so don't bother trying for now...maybe ever (bad idea)?
                var extraCxClasses = this.extraCharacteristicsMap[ZWayServerPlatform.getVDevTypeKey(vdev)];
                var extraCxs = [];
                if(!extraCxClasses || extraCxClasses.length === 0) continue;
                for(var j = 0; j < extraCxClasses.length; j++){
                    var cx = new extraCxClasses[j]();
                    if(existingCxUUIDs[cx.UUID]) continue; // Don't have two of the same Characteristic type in one service!
                    var vdev2 = this.getVDevForCharacteristic(cx, vdev); // Just in case...will probably return vdev.
                    if(!vdev2){
                        // Uh oh... one of the extraCxClasses can't be configured! Abort all extras for this vdev!
                        extraCxs = []; // to wipe out any already setup cxs.
                        break;
                    }
                    this.configureCharacteristic(cx, vdev2, service);
                    extraCxs.push(cx);
                }
                for(var j = 0; j < extraCxs.length; j++)
                    service.addCharacteristic(extraCxs[j]);
            }
        }

        debug("Loaded services for " + this.name);
        return services;
    }
};

module.exports.accessory = ZWayServerAccessory;
module.exports.platform = ZWayServerPlatform;
