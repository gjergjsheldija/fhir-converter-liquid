import assert from "assert";
import {mkdir, mkdtemp, rm, symlink, writeFile} from "fs/promises";
import os from "os";
import path from "path";
import {GetSecretValueCommand} from "@aws-sdk/client-secrets-manager";
import {
    createSecretResolver,
    isSecretRef,
    parseSecretRef,
    redactSecretsForDisplay
} from "./secretResolver.js";

describe("SecretResolver", function () {
    describe("parseSecretRef", function () {
        it("parses aws-sm:// secret IDs with slashes and #jsonKey fragments", function () {
            const parsed = parseSecretRef("aws-sm://prod/customers/uk-essen#fhirToken");
            assert.strictEqual(parsed.scheme, "aws-sm");
            assert.strictEqual(parsed.baseUri, "aws-sm://prod/customers/uk-essen");
            assert.strictEqual(parsed.secretId, "prod/customers/uk-essen");
            assert.strictEqual(parsed.jsonKey, "fhirToken");
            assert.strictEqual(isSecretRef("aws-sm://prod/customers/uk-essen#fhirToken"), true);
        });

        it("parses vault:// KV v2 mount, path, and #jsonKey", function () {
            const parsed = parseSecretRef("vault://kv/prod/data/customers/uk-essen#apiKey");
            assert.strictEqual(parsed.scheme, "vault");
            assert.strictEqual(parsed.baseUri, "vault://kv/prod/data/customers/uk-essen");
            assert.strictEqual(parsed.mount, "kv/prod");
            assert.strictEqual(parsed.path, "customers/uk-essen");
            assert.strictEqual(parsed.jsonKey, "apiKey");
        });

        it("parses infisical:// root and nested folder paths", function () {
            const rootParsed = parseSecretRef("infisical://proj-1/prod/FHIR_SECRET");
            assert.strictEqual(rootParsed.projectId, "proj-1");
            assert.strictEqual(rootParsed.environment, "prod");
            assert.strictEqual(rootParsed.secretPath, "/");
            assert.strictEqual(rootParsed.secretName, "FHIR_SECRET");
            assert.strictEqual(rootParsed.jsonKey, null);

            const nestedParsed = parseSecretRef("infisical://proj-1/staging/customers/uk-essen/BUNDLE_SECRET#clientSecret");
            assert.strictEqual(nestedParsed.secretPath, "/customers/uk-essen");
            assert.strictEqual(nestedParsed.secretName, "BUNDLE_SECRET");
            assert.strictEqual(nestedParsed.jsonKey, "clientSecret");
        });

        it("parses file:// and env:// secret references", function () {
            const fileRef = parseSecretRef("file://uk-essen/fhir-token");
            assert.strictEqual(fileRef.scheme, "file");
            assert.strictEqual(fileRef.filePath, "uk-essen/fhir-token");

            const envRef = parseSecretRef("env://UK_ESSEN_SECRETS#inboundKey");
            assert.strictEqual(envRef.scheme, "env");
            assert.strictEqual(envRef.varName, "UK_ESSEN_SECRETS");
            assert.strictEqual(envRef.jsonKey, "inboundKey");
        });

        it("rejects malformed or unsupported secret references with status 400", function () {
            for (const bad of [
                "",
                "not-a-uri",
                "http://example.com/secret",
                "aws-sm://",
                "vault://secret/customers/missing-data-segment",
                "infisical://proj-only/env-only",
                "env://123-INVALID",
                "env://VALID#"
            ]) {
                assert.throws(() => parseSecretRef(bad), {status: 400});
            }
            assert.strictEqual(isSecretRef("https://example.com"), false);
        });
    });

    describe("AWS Secrets Manager (aws-sm://)", function () {
        it("fetches via GetSecretValueCommand and shares one base-URI cache entry across multiple #jsonKey lookups", async function () {
            const commands = [];
            const awsClient = {
                send: async (cmd) => {
                    commands.push(cmd);
                    return {
                        SecretString: JSON.stringify({
                            fhirToken: "fhir-tok-123",
                            gatewayKey: "gw-key-456",
                            inboundKey: "in-key-789",
                            nested: {clientSecret: "nested-sec"}
                        })
                    };
                }
            };
            const resolver = createSecretResolver({awsClient, ttlMs: 60000});

            const [t1, t2, t3, t4] = await Promise.all([
                resolver.resolve("aws-sm://prod/customers/uk-essen#fhirToken"),
                resolver.resolve("aws-sm://prod/customers/uk-essen#gatewayKey"),
                resolver.resolve("aws-sm://prod/customers/uk-essen#inboundKey"),
                resolver.resolve("aws-sm://prod/customers/uk-essen#nested.clientSecret")
            ]);

            assert.strictEqual(t1, "fhir-tok-123");
            assert.strictEqual(t2, "gw-key-456");
            assert.strictEqual(t3, "in-key-789");
            assert.strictEqual(t4, "nested-sec");
            assert.strictEqual(commands.length, 1);
            assert.ok(commands[0] instanceof GetSecretValueCommand);
            assert.strictEqual(commands[0].input.SecretId, "prod/customers/uk-essen");
        });

        it("decodes UTF-8 SecretBinary payloads and re-fetches after invalidate()", async function () {
            let version = 1;
            const awsClient = {
                send: async () => ({
                    SecretBinary: Buffer.from(`binary-secret-v${version++}`, "utf8")
                })
            };
            const resolver = createSecretResolver({awsClient, ttlMs: 60000});

            assert.strictEqual(await resolver.resolve("aws-sm://prod/raw-binary"), "binary-secret-v1");
            assert.strictEqual(await resolver.resolve("aws-sm://prod/raw-binary"), "binary-secret-v1");

            resolver.invalidate("aws-sm://prod/raw-binary");
            assert.strictEqual(await resolver.resolve("aws-sm://prod/raw-binary"), "binary-secret-v2");
        });
    });

    describe("OpenBao / HashiCorp Vault KV v2 (vault://)", function () {
        it("resolves secrets using VAULT_TOKEN and optional VAULT_NAMESPACE", async function () {
            const calls = [];
            const resolver = createSecretResolver({
                env: {
                    VAULT_ADDR: "https://vault.internal:8200/",
                    VAULT_TOKEN: "s.vault-static-token",
                    VAULT_NAMESPACE: "healthcare/prod"
                },
                fetchImpl: async (url, init) => {
                    calls.push({url, init});
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            data: {
                                data: {
                                    fhirToken: "vault-fhir-token",
                                    gatewayToken: "vault-gw-token"
                                }
                            }
                        })
                    };
                }
            });

            const val = await resolver.resolve("vault://secret/data/customers/charite#fhirToken");
            assert.strictEqual(val, "vault-fhir-token");
            assert.strictEqual(calls.length, 1);
            assert.strictEqual(calls[0].url, "https://vault.internal:8200/v1/secret/data/customers/charite");
            assert.strictEqual(calls[0].init.headers["X-Vault-Token"], "s.vault-static-token");
            assert.strictEqual(calls[0].init.headers["X-Vault-Namespace"], "healthcare/prod");
        });

        it("logs in automatically via AppRole when VAULT_ROLE_ID and VAULT_SECRET_ID are set", async function () {
            const calls = [];
            const resolver = createSecretResolver({
                env: {
                    VAULT_ADDR: "https://openbao.internal",
                    VAULT_ROLE_ID: "role-abc",
                    VAULT_SECRET_ID: "secret-xyz"
                },
                fetchImpl: async (url, init) => {
                    calls.push({url, init});
                    if (url.endsWith("/v1/auth/approle/login")) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ({
                                auth: {client_token: "s.approle-token", lease_duration: 600}
                            })
                        };
                    }
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            data: {data: {value: "plain-kv-secret"}}
                        })
                    };
                }
            });

            const secret = await resolver.resolve("vault://kv/data/app-key");
            assert.strictEqual(secret, "plain-kv-secret");
            assert.strictEqual(calls.length, 2);
            assert.strictEqual(calls[0].url, "https://openbao.internal/v1/auth/approle/login");
            assert.deepStrictEqual(JSON.parse(calls[0].init.body), {role_id: "role-abc", secret_id: "secret-xyz"});
            assert.strictEqual(calls[1].init.headers["X-Vault-Token"], "s.approle-token");
        });
    });

    describe("Infisical (infisical://)", function () {
        it("logs in with Universal Auth when INFISICAL_TOKEN is absent and extracts #jsonKey", async function () {
            const calls = [];
            const resolver = createSecretResolver({
                env: {
                    INFISICAL_URL: "https://infisical.internal/",
                    INFISICAL_CLIENT_ID: "cid-1",
                    INFISICAL_CLIENT_SECRET: "csec-2"
                },
                fetchImpl: async (url, init) => {
                    calls.push({url, init});
                    if (url.endsWith("/api/v1/auth/universal-auth/login")) {
                        return {
                            ok: true,
                            status: 200,
                            json: async () => ({accessToken: "inf-access-tok", expiresIn: 7200})
                        };
                    }
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            secret: {
                                secretValue: JSON.stringify({apiKey: "inf-gw-key-99"})
                            }
                        })
                    };
                }
            });

            const val = await resolver.resolve("infisical://ws-42/prod/customers/uk-essen/SECRETS#apiKey");
            assert.strictEqual(val, "inf-gw-key-99");
            assert.strictEqual(calls.length, 2);
            assert.strictEqual(calls[0].url, "https://infisical.internal/api/v1/auth/universal-auth/login");
            const reqUrl = new URL(calls[1].url);
            assert.strictEqual(reqUrl.pathname, "/api/v3/secrets/raw/SECRETS");
            assert.strictEqual(reqUrl.searchParams.get("workspaceId"), "ws-42");
            assert.strictEqual(reqUrl.searchParams.get("environment"), "prod");
            assert.strictEqual(reqUrl.searchParams.get("secretPath"), "/customers/uk-essen");
            assert.strictEqual(calls[1].init.headers.Authorization, "Bearer inf-access-tok");
        });
    });

    describe("Mounted Kubernetes secret files (file://)", function () {
        let tempDir;
        let outsideDir;

        beforeEach(async function () {
            tempDir = await mkdtemp(path.join(os.tmpdir(), "fhir-secrets-root-"));
            outsideDir = await mkdtemp(path.join(os.tmpdir(), "fhir-secrets-outside-"));
        });

        afterEach(async function () {
            await rm(tempDir, {recursive: true, force: true});
            await rm(outsideDir, {recursive: true, force: true});
        });

        it("reads mounted secret files, trims trailing K8s newlines, and allows internal ..data symlinks", async function () {
            const k8sAtomicDir = path.join(tempDir, "uk-essen", "..2026_11_26");
            await mkdir(k8sAtomicDir, {recursive: true});
            await writeFile(path.join(k8sAtomicDir, "fhir-token"), "k8s-mounted-token\n", "utf8");
            await writeFile(
                path.join(k8sAtomicDir, "credentials.json"),
                JSON.stringify({username: "svc-fhir", password: "pw-123"}) + "\r\n",
                "utf8"
            );
            await symlink("..2026_11_26", path.join(tempDir, "uk-essen", "..data"));
            await symlink(path.join("..data", "fhir-token"), path.join(tempDir, "uk-essen", "fhir-token"));
            await symlink(path.join("..data", "credentials.json"), path.join(tempDir, "uk-essen", "credentials.json"));

            const resolver = createSecretResolver({secretsFileRoot: tempDir});
            assert.strictEqual(await resolver.resolve("file://uk-essen/fhir-token"), "k8s-mounted-token");
            assert.strictEqual(await resolver.resolve("file://uk-essen/credentials.json#password"), "pw-123");
        });

        it("blocks .. path traversal, absolute escapes, and external symlinks with status 400", async function () {
            const outsideSecret = path.join(outsideDir, "stolen.txt");
            await writeFile(outsideSecret, "top-secret", "utf8");
            await symlink(outsideSecret, path.join(tempDir, "evil-symlink"));

            const resolver = createSecretResolver({secretsFileRoot: tempDir});

            await assert.rejects(() => resolver.resolve("file://../stolen.txt"), {status: 400});
            await assert.rejects(() => resolver.resolve(`file://${outsideSecret}`), {status: 400});
            await assert.rejects(() => resolver.resolve("file://evil-symlink"), {status: 400});
        });
    });

    describe("Environment variables (env://), TTL, and redaction", function () {
        it("resolves plain and JSON env:// secrets and respects TTL expiration", async function () {
            const env = {
                PLAIN_TOKEN: "env-tok-1",
                JSON_BUNDLE: JSON.stringify({fhirToken: "env-json-tok"})
            };
            const resolver = createSecretResolver({env, ttlMs: 15});

            assert.strictEqual(await resolver.resolve("env://PLAIN_TOKEN"), "env-tok-1");
            assert.strictEqual(await resolver.resolve("env://JSON_BUNDLE#fhirToken"), "env-json-tok");

            env.PLAIN_TOKEN = "env-tok-2";
            assert.strictEqual(await resolver.resolve("env://PLAIN_TOKEN"), "env-tok-1");

            await new Promise((r) => setTimeout(r, 25));
            assert.strictEqual(await resolver.resolve("env://PLAIN_TOKEN"), "env-tok-2");

            await assert.rejects(() => resolver.resolve("env://MISSING_VAR"), {status: 404});
        });

        it("redacts secretRef URIs to scheme metadata and strips inline secret fields without mutating input", function () {
            const input = {
                customerId: "example-hospital",
                inboundAuth: {
                    secretRef: "aws-sm://prod/customers/example-hospital#inboundKey",
                    apiKey: "inline-should-be-stripped"
                },
                targets: {
                    fhirServer: {
                        baseUrl: "https://fhir.example.org",
                        auth: {
                            type: "oauth2_client_credentials",
                            tokenUrl: "https://idp.example.org/oauth/token",
                            clientId: "fhir-client",
                            clientSecret: "super-secret-inline",
                            clientSecretRef: "vault://secret/data/example#clientSecret"
                        }
                    },
                    hl7v2Gateway: {
                        auth: {
                            type: "basic",
                            username: "mllp-bridge",
                            password: "raw-password"
                        }
                    }
                }
            };

            const redacted = redactSecretsForDisplay(input);
            const serialized = JSON.stringify(redacted);

            assert.strictEqual(redacted.inboundAuth.secretRef, "[REDACTED:aws-sm]");
            assert.strictEqual("apiKey" in redacted.inboundAuth, false);
            assert.strictEqual(redacted.targets.fhirServer.auth.clientId, "fhir-client");
            assert.strictEqual(redacted.targets.fhirServer.auth.clientSecretRef, "[REDACTED:vault]");
            assert.strictEqual("clientSecret" in redacted.targets.fhirServer.auth, false);
            assert.strictEqual("password" in redacted.targets.hl7v2Gateway.auth, false);
            assert.ok(!serialized.includes("super-secret-inline"));
            assert.ok(!serialized.includes("raw-password"));
            assert.ok(!serialized.includes("inline-should-be-stripped"));
            assert.strictEqual(input.targets.fhirServer.auth.clientSecret, "super-secret-inline");
        });
    });
});
