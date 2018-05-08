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

import { parse, Root, common } from "protobufjs";
import { resolve, basename, extname, join, dirname } from "path";
import { existsSync, readFileSync } from "fs";
import { obj as through } from "through2";
// import * as PluginError from "plugin-error";
import { Transform } from "stream";
import * as BufferStreams from "bufferstreams";
import { registerHelper, compile } from "handlebars";
import { Options } from "./options";

// const PLUGIN_NAME = "grpc-typescript";
const TEMPLATE_EXT = ".hbs";
const KNOWN_PREFIX = "google.protobuf.";

function jsType(protoType: string): string {
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
        case "Any":
        case "Timestamp":
        case "Duration":
        case "Struct":
        case "Wrapper":
        case "FieldMask":
        case "ListValue":
        case "Value":
        case "NullValue":
            return `${KNOWN_PREFIX}${protoType}`;
    }

    if (protoType.substr(0, KNOWN_PREFIX.length) === KNOWN_PREFIX) return protoType;

    return null;
}

// tslint:disable-next-line:only-arrow-functions
registerHelper("memberType", function(field, options) {
    // Check for known JS types
    let type = jsType(field.type);

    // If not a known type, assume it's a custom type in the namespace
    if (!type) type = `${options.data._parent.key}.${field.type}`;

    // Maps
    else if (field.keyType) type = `{ [key: ${jsType(field.keyType)}]: ${type} }`;

    return type;
});

// tslint:disable-next-line:only-arrow-functions
registerHelper("is", function(conditional, value, options) {
    if (typeof conditional === "function") {
        conditional = conditional.call(this);
    }

    if (typeof value === "function") {
        value = value.call(this);
    }

    if (conditional !== value) {
        return options.inverse(this);
    } else {
        return options.fn(this);
    }
});

// tslint:disable-next-line:only-arrow-functions
registerHelper("isScalar", function(field, options) {
    let result = false;

    switch (field.type) {
        case "string":
        case "bool":
        case "bytes":
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
            result = true;
    }

    return result ? options.fn(this) : options.inverse(this);
});

function findTemplate(path: string, ext: string) {
    const known = resolve(__dirname, "..", "templates", `${path}-${ext}${TEMPLATE_EXT}`);
    if (existsSync(known)) return known;
    if (existsSync(path)) return path;
    if (path.slice(-TEMPLATE_EXT.length) !== TEMPLATE_EXT) path += TEMPLATE_EXT;
    if (existsSync(path)) return path;
    return null;
}

export = ({
    template = "interface",
    type = "typescript",
    keepCase = false
}: Options = {}): Transform => {

    return through((file, _enc, callback) => {

        const ext = type === "typescript" ? "ts" : "js";

        const path = findTemplate(template, ext);
        if (!path) return callback(`template not found: ${template}`);

        const root = new Root();

        function createOutput() {
            const json = JSON.stringify(root, null, 2);

            // Load and compile template
            const compiled = compile(readFileSync(path, "utf8"));
            let results = compiled(JSON.parse(json));

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
            root.loadSync(file.path, { keepCase }).resolveAll();
            file.contents = Buffer.from(createOutput());

            const fileName = `${basename(file.path, extname(file.path))}.${ext}`;
            file.path = join(dirname(file.path), fileName);
        } else if (file.isStream()) {
            // Stream
            const bufferStream = new BufferStreams((_err, buffer, cb) => {
                const contents = buffer.toString("utf8");
                const parsed = parse(contents, root, { keepCase });

                // Load known types
                if (parsed.imports) {
                    parsed.imports.forEach(imported => {
                        if (common[imported]) {
                            // tslint:disable-next-line:no-string-literal
                            root.setOptions(common[imported].options)["addJSON"](common[imported].nested);
                        }
                    });
                }

                const results = createOutput();
                cb(null, results);
                // if (err) this.emit('error', err);
            });
            file.contents = file.contents.pipe(bufferStream);
            const fileName = `${basename(file.path, extname(file.path))}.${ext}`;
            file.path = join(dirname(file.path), fileName);
        } else {
            callback(null, file);
        }

        callback(null, file);
    });
};
