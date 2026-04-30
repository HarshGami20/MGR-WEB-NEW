import { defineConfig, type InputTransformerFn } from "orval";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const apiClientSrc = path.resolve(appRoot, "src", "api-client");

const titleTransformer: InputTransformerFn = (config) => {
  config.info ??= {};
  config.info.title = "Api";
  return config;
};

export default defineConfig({
  "api-client-react": {
    input: {
      target: path.join(__dirname, "openapi.yaml"),
      override: { transformer: titleTransformer },
    },
    output: {
      workspace: apiClientSrc,
      target: "generated",
      client: "react-query",
      mode: "split",
      baseUrl: "/api",
      clean: true,
      prettier: true,
      override: {
        fetch: { includeHttpResponseReturnType: false },
        mutator: {
          path: path.resolve(apiClientSrc, "custom-fetch.ts"),
          name: "customFetch",
        },
      },
    },
  },
});
