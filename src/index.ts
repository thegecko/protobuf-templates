/*
* grpc-typescript
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

import { parse, Root } from "protobufjs";
import { resolve, basename, extname, join, dirname } from "path";
import { existsSync, readFileSync } from "fs";
import { obj as through } from "through2";
// import * as PluginError from "plugin-error";
import { Transform } from "stream";
import * as BufferStreams from "bufferstreams";
import { registerHelper, compile } from "handlebars";
import { Options } from "./options";

registerHelper("memberType", (field, options) => {
    let type = `${options.data._parent.key}.${field.type}`;
    switch (field.type) {
        case "string":
            type = "string";
        case "bool":
            type = "boolean";
        case "bytes":
            type = "Uint8Array";
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
            type = "number";
    }

    if (field.rule === "repeated") type += "[]";
    return type;
});

// const PLUGIN_NAME = "grpc-typescript";
const TEMPLATE_EXT = ".hbs";

function findTemplate(path: string, ext: string) {
    const known = resolve(__dirname, "..", "templates", `${path}-${ext}${TEMPLATE_EXT}`);
    if (existsSync(known)) return known;
    if (existsSync(path)) return path;
    if (!path.endsWith(TEMPLATE_EXT)) path += TEMPLATE_EXT;
    if (existsSync(path)) return path;
    return null;
}

export = ({
    template = "client",
    type = "typescript",
    keepCase = false
}: Options): Transform => {

    return through((file, _enc, callback) => {

        const ext = type === "typescript" ? "ts" : "js";

        const path = findTemplate(template, ext);
        if (!path) return callback(`template not found: ${template}`);

        function createJson(contents) {
            const root = new Root();
            parse(contents, root, { keepCase });
            const json = JSON.stringify(root, null, 2);
            // tslint:disable-next-line:no-console
            console.log(json);

            // Load and compile template
            const compiled = compile(readFileSync(path, "utf8"), {
//                preventIndent: true
            });
            // const compiled = dot.template(readFileSync(path, "utf8"));
            return compiled(JSON.parse(json));
        }

        if (file.isNull()) {
            // Empty file
            callback(null, file);
        }

        if (file.isBuffer()) {
            // File
            file.contents = createJson(file.contents);
            const fileName = `${basename(file.path, extname(file.path))}.${ext}`;
            file.path = join(dirname(file.path), fileName);
        } else if (file.isStream()) {
            // Stream
            const bufferStream = new BufferStreams((_err, buffer, cb) => {
                const results = createJson(buffer.toString("utf8"));
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

        // tslint:disable-next-line:no-console
        // console.log(root);
    });
};
