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

// tslint:disable:only-arrow-functions

import { registerHelper } from "handlebars";

const KNOWN_PREFIX = "google.protobuf.";

export function registerHelpers() {

    registerHelper("is", function(conditional, value, options) {
        if (typeof conditional === "function") {
            conditional = conditional.call(this);
        }

        if (typeof value === "function") {
            value = value.call(this);
        }

        if (conditional === value) {
            return options.fn(this);
        } else {
            return options.inverse(this);
        }
    });

    registerHelper("empty", function(conditional, options) {
        if (typeof conditional === "function") {
            conditional = conditional.call(this);
        }

        if (Object.keys(conditional).length === 0) {
            return options.fn(this);
        } else {
            return options.inverse(this);
        }
    });

    registerHelper("once", function(options) {
        if (!options.data.once) {
            options.data.once = true;
            return options.fn(this);
        } else {
            return options.inverse(this);
        }
    });

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

        // Treat enums as scalar, too
        if (!result && field.options && field.options.enum) result = true;

        return result ? options.fn(this) : options.inverse(this);
    });

    registerHelper("memberType", function(field) {

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

        // Check for known JS types
        let type = jsType(field.type);

        if (!type) {
            // If it's not a known type, default to the field type
            type = field.type;

            // Check for a parent
            if (field.options && field.options.parent) {
                type = `${field.options.parent}.${type}`;
            }
        }

        // Maps
        if (field.keyType) type = `{ [key: ${jsType(field.keyType)}]: ${type} }`;

        return type;
    });

    registerHelper("defaultValue", function(field) {
        // Map
        if (field.keyType) return "{}";

        switch (field.type) {
            case "string":
                return "\"\"";
            case "bool":
                return false;
            case "bytes":
                return "new Uint8Array(0)";
            case "Any":
            case "Timestamp":
            case "Duration":
            case "Struct":
            case "Wrapper":
            case "FieldMask":
            case "ListValue":
            case "Value":
            case "NullValue":
                return `new ${KNOWN_PREFIX}${field.type}()`;
        }

        // Fully qualified known types
        if (field.type.substr(0, KNOWN_PREFIX.length) === KNOWN_PREFIX) return `new ${field.type}()`;

        // Default for numbers and enums
        return 0;
    });

    registerHelper("wireKey", function(type, id) {
        let key = 0;

        switch (type) {
            case "double":
            case "fixed64":
            case "sfixed64":
                key = 1;
                break;
            case "string":
            case "bytes":
            case "embedded":
            case "repeated":
                key = 2;
                break;
            case "float":
            case "fixed32":
            case "sfixed32":
                key = 5;
                break;
        }

        return `/* id ${id}, wireType ${key} */${(id << 3) | key}`;
    });

    registerHelper("wireType", function(field) {
        if (field.options && field.options.enum) {
            return "int32";
        }
        return field.type;
    });
}
