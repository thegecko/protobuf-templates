export interface Options {
    /**
     * The template to use, defaults to "interface"
     */
    template?: "interface" | "server";
    /**
     * The target language to use, defaults to "typescript"
     */
    type?: "typescript" | "javascript";
    /**
     * Keeps field casing instead of converting to camel case
     */
    keepCase?: boolean;
}
