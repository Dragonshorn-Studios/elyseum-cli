import typescript from "@rollup/plugin-typescript";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import shebang from "rollup-plugin-preserve-shebang";
import json from "@rollup/plugin-json";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/index.js",
    format: "es",
    sourcemap: true,
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    json(),
    typescript({ tsconfig: "./tsconfig.json" }),
    shebang(),
  ],
};
