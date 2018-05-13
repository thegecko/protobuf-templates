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
var PluginError = require("plugin-error");
var BufferStreams = require("bufferstreams");
var handlebars_1 = require("handlebars");
var extensions_1 = require("./extensions");
var PLUGIN_NAME = "protobuf-templates";
var TEMPLATE_EXT = ".hbs";
extensions_1.registerHelpers();
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
function walkTree(item) {
    if (item.nested) {
        Object.keys(item.nested).forEach(function (key) {
            walkTree(item.nested[key]);
        });
    }
    if (item.fields) {
        Object.keys(item.fields).forEach(function (key) {
            var field = item.fields[key];
            if (field.resolvedType) {
                // Record the field's parent name
                if (field.resolvedType.parent) {
                    // Abuse the options object!
                    if (!field.options)
                        field.options = {};
                    field.options.parent = field.resolvedType.parent.name;
                }
                // Record if the field is an enum
                if (field.resolvedType instanceof protobufjs_1.Enum) {
                    // Abuse the options object!
                    if (!field.options)
                        field.options = {};
                    field.options.enum = true;
                }
            }
        });
    }
}
module.exports = function (_a) {
    var _b = _a === void 0 ? {} : _a, _c = _b.template, template = _c === void 0 ? "interface" : _c, _d = _b.type, type = _d === void 0 ? "typescript" : _d, _e = _b.keepCase, keepCase = _e === void 0 ? false : _e;
    return through2_1.obj(function (file, _enc, callback) {
        var ext = type === "typescript" ? "ts" : "js";
        var path = findTemplate(template, ext);
        if (!path)
            return callback("template not found: " + template);
        extensions_1.registerPartials([
            "interfaces",
            "messages"
        ], "ts");
        var root = new protobufjs_1.Root();
        function createOutput() {
            root.resolveAll();
            walkTree(root);
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
            root.loadSync(file.path, { keepCase: keepCase }).resolveAll();
            file.contents = Buffer.from(createOutput());
            var fileName = path_1.basename(file.path, path_1.extname(file.path)) + "." + ext;
            file.path = path_1.join(path_1.dirname(file.path), fileName);
        }
        else if (file.isStream()) {
            // Stream
            var bufferStream = new BufferStreams(function (error, buffer, cb) {
                if (error)
                    throw new PluginError(PLUGIN_NAME, error);
                var contents = buffer.toString("utf8");
                var parsed = protobufjs_1.parse(contents, root, { keepCase: keepCase });
                // Load known types
                if (parsed.imports) {
                    parsed.imports.forEach(function (imported) {
                        if (protobufjs_1.common[imported]) {
                            // tslint:disable-next-line:no-string-literal
                            root.setOptions(protobufjs_1.common[imported].options)["addJSON"](protobufjs_1.common[imported].nested);
                        }
                    });
                }
                var results = createOutput();
                cb(null, results);
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
