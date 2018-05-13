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

import { parse, Root, common, Enum } from "protobufjs";
import { resolve, basename, extname, join, dirname } from "path";
import { existsSync, readFileSync } from "fs";
import { obj as through } from "through2";
import * as PluginError from "plugin-error";
import { Transform } from "stream";
import * as BufferStreams from "bufferstreams";
import { compile } from "handlebars";
import { Options } from "./options";
import { registerPartials, registerHelpers } from "./extensions";

const PLUGIN_NAME = "protobuf-templates";
const TEMPLATE_EXT = ".hbs";

registerHelpers();

function findTemplate(path: string, ext: string) {
    const known = resolve(__dirname, "..", "templates", `${path}-${ext}${TEMPLATE_EXT}`);
    if (existsSync(known)) return known;
    if (existsSync(path)) return path;
    if (path.slice(-TEMPLATE_EXT.length) !== TEMPLATE_EXT) path += TEMPLATE_EXT;
    if (existsSync(path)) return path;
    return null;
}

function walkTree(item) {
    if (item.nested) {
        Object.keys(item.nested).forEach(key => {
            walkTree(item.nested[key]);
        });
    }

    if (item.fields) {
        Object.keys(item.fields).forEach(key => {
            const field = item.fields[key];
            if (field.resolvedType) {

                // Record the field's parent name
                if (field.resolvedType.parent) {
                    // Abuse the options object!
                    if (!field.options) field.options = {};
                    field.options.parent = field.resolvedType.parent.name;
                }

                // Record if the field is an enum
                if (field.resolvedType instanceof Enum) {
                    // Abuse the options object!
                    if (!field.options) field.options = {};
                    field.options.enum = true;
                }
            }
        });
    }
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

        registerPartials([
            "interfaces",
            "messages"
        ], "ts");

        const root = new Root();

        function createOutput() {
            root.resolveAll();
            walkTree(root);
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
            const bufferStream = new BufferStreams((error, buffer, cb) => {
                if (error) throw new PluginError(PLUGIN_NAME, error);

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
