"use strict";
/*
 * protobuf-templates
 * Copyright (c) 2018 Rob Moran
 *
 * The MIT License (MIT)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
var protobufjs_1 = require("protobufjs");
var path_1 = require("path");
var fs_1 = require("fs");
var through2_1 = require("through2");
var BufferStreams = require("bufferstreams");
var handlebars_1 = require("handlebars");
// const PLUGIN_NAME = "grpc-typescript";
var TEMPLATE_EXT = ".hbs";
function jsType(protoType) {
    switch (protoType) {
        case "string":
            return "string";
        case "bool":
            return "boolean";
        case "bytes":
            return "Uint8Array";
        case "double":
        case "float":
        case "int32":
        case "int64":
        case "uint32":
        case "uint64":
        case "sint32":
        case "sint64":
        case "fixed32":
        case "fixed64":
        case "sfixed32":
        case "sfixed64":
            return "number";
    }
    return null;
}
handlebars_1.registerHelper("memberType", function (field, options) {
    // Check for known JS types
    var type = jsType(field.type);
    // If not a known type, assume it's a custom type in the namespace
    if (!type)
        type = options.data._parent.key + "." + field.type;
    // Array
    if (field.rule === "repeated")
        type += "[]";
    // Maps
    else if (field.keyType)
        type = "{ [key: " + jsType(field.keyType) + "]: " + type + " }";
    return type;
});
function findTemplate(path, ext) {
    var known = path_1.resolve(__dirname, "..", "templates", path + "-" + ext + TEMPLATE_EXT);
    if (fs_1.existsSync(known))
        return known;
    if (fs_1.existsSync(path))
        return path;
    if (path.slice(-TEMPLATE_EXT.length) !== TEMPLATE_EXT)
        path += TEMPLATE_EXT;
    if (fs_1.existsSync(path))
        return path;
    return null;
}
module.exports = function (_a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.template, template = _c === void 0 ? "interface" : _c, _d = _b.type, type = _d === void 0 ? "typescript" : _d, _e = _b.keepCase, keepCase = _e === void 0 ? false : _e;
    return through2_1.obj(function (file, _enc, callback) {
        var ext = type === "typescript" ? "ts" : "js";
        var path = findTemplate(template, ext);
        if (!path)
            return callback("template not found: " + template);
        function createJson(contents) {
            var root = new protobufjs_1.Root();
            protobufjs_1.parse(contents, root, { keepCase: keepCase });
            var json = JSON.stringify(root, null, 2);
            // Load and compile template
            var compiled = handlebars_1.compile(fs_1.readFileSync(path, "utf8"));
            var results = compiled(JSON.parse(json));
            // Ensure single blank lines
            results = results.replace(/[\n\r]{2,}/gm, "\n\n");
            // Ensure no spaces on empty lines
            results = results.replace(/^\s+$/gm, "");
            return results;
        }
        if (file.isNull()) {
            // Empty file
            callback(null, file);
        }
        if (file.isBuffer()) {
            // File
            file.contents = createJson(file.contents);
            var fileName = path_1.basename(file.path, path_1.extname(file.path)) + "." + ext;
            file.path = path_1.join(path_1.dirname(file.path), fileName);
        }
        else if (file.isStream()) {
            // Stream
            var bufferStream = new BufferStreams(function (_err, buffer, cb) {
                var results = createJson(buffer.toString("utf8"));
                cb(null, results);
                // if (err) this.emit('error', err);
            });
            file.contents = file.contents.pipe(bufferStream);
            var fileName = path_1.basename(file.path, path_1.extname(file.path)) + "." + ext;
            file.path = path_1.join(path_1.dirname(file.path), fileName);
        }
        else {
            callback(null, file);
        }
        callback(null, file);
    });
};
