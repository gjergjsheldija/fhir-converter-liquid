import { registerHooks } from "node:module";
import { resolve, load } from "./templategenerate-loader.mjs";

registerHooks({ resolve, load });
