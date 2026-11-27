import {DEFAULT_R2_OPENAPI_OUTPUT, exportR2OpenApiSpec} from "../src/lib/openapi/r2OpenApi.js";

const outputPath = process.argv[2] || DEFAULT_R2_OPENAPI_OUTPUT;
await exportR2OpenApiSpec(outputPath);
console.log(`Exported OpenAPI 3.0.3 spec to ${outputPath}`);
