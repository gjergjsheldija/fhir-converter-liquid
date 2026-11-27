import assert from "assert";
import {createSecretResolver} from "../vault/secretResolver.js";
import {
    buildOutboundHeaders,
    clearOAuthTokenCache,
    invalidateAuthSecrets,
    isRefreshableAuth
} from "./outboundAuth.js";

describe("outboundAuth", function () {
    beforeEach(function () {
        clearOAuthTokenCache();
    });

    it("returns baseHeaders unchanged for none or undefined auth and preserves legacy Studio inline auth", async function () {
        const baseHeaders = {Accept: "application/fhir+json"};
        assert.deepStrictEqual(await buildOutboundHeaders(undefined, {baseHeaders}), {
            Accept: "application/fhir+json"
        });
        assert.deepStrictEqual(await buildOutboundHeaders({type: "none"}, {baseHeaders}), {
            Accept: "application/fhir+json"
        });
        assert.deepStrictEqual(await buildOutboundHeaders({auth: "bearer", token: "studio-tok"}, {baseHeaders}), {
            Accept: "application/fhir+json",
            Authorization: "Bearer studio-tok"
        });
        assert.deepStrictEqual(await buildOutboundHeaders({auth: "bearer", token: ""}, {baseHeaders}), {
            Accept: "application/fhir+json"
        });
        assert.deepStrictEqual(
            await buildOutboundHeaders({auth: "basic", username: "alice", password: "secret"}, {baseHeaders}),
            {
                Accept: "application/fhir+json",
                Authorization: "Basic " + Buffer.from("alice:secret").toString("base64")
            }
        );
    });

    it("resolves bearer, basic, and api_key_header credentials from SecretResolver", async function () {
        const secretResolver = createSecretResolver({
            env: {
                CUSTOMER_SECRETS: JSON.stringify({
                    bearerTok: "vault-bearer-999",
                    basicUser: "svc-his",
                    basicPass: "s3cr3t!",
                    gwApiKey: "mllp-gw-key-42"
                })
            }
        });

        const bearerHeaders = await buildOutboundHeaders(
            {type: "bearer", secretRef: "env://CUSTOMER_SECRETS#bearerTok"},
            {secretResolver, baseHeaders: {Accept: "application/json"}}
        );
        assert.strictEqual(bearerHeaders.Authorization, "Bearer vault-bearer-999");

        const basicHeaders = await buildOutboundHeaders(
            {
                type: "basic",
                usernameSecretRef: "env://CUSTOMER_SECRETS#basicUser",
                passwordSecretRef: "env://CUSTOMER_SECRETS#basicPass"
            },
            {secretResolver}
        );
        assert.strictEqual(
            basicHeaders.Authorization,
            "Basic " + Buffer.from("svc-his:s3cr3t!").toString("base64")
        );

        const defaultApiKeyHeaders = await buildOutboundHeaders(
            {type: "api_key", secretRef: "env://CUSTOMER_SECRETS#gwApiKey"},
            {secretResolver}
        );
        assert.strictEqual(defaultApiKeyHeaders["X-API-Key"], "mllp-gw-key-42");

        const customHeaderHeaders = await buildOutboundHeaders(
            {type: "api_key_header", headerName: "X-Gateway-Token", secretRef: "env://CUSTOMER_SECRETS#gwApiKey"},
            {secretResolver}
        );
        assert.strictEqual(customHeaderHeaders["X-Gateway-Token"], "mllp-gw-key-42");

        const aliasHeaderHeaders = await buildOutboundHeaders(
            {type: "header", headerName: "X-Custom-Auth", apiKey: "inline-key"},
            {secretResolver}
        );
        assert.strictEqual(aliasHeaderHeaders["X-Custom-Auth"], "inline-key");
    });

    it("exchanges OAuth2 client_credentials, caches access_token, and evicts on invalidateAuthSecrets", async function () {
        const env = {
            OAUTH_SECRET: "client-secret-v1"
        };
        const secretResolver = createSecretResolver({env, ttlMs: 60000});
        const tokenCalls = [];
        let tokenSeq = 1;

        const fetchImpl = async (url, init) => {
            tokenCalls.push({url, init});
            return {
                ok: true,
                status: 200,
                text: async () =>
                    JSON.stringify({
                        access_token: `oauth-tok-${tokenSeq++}`,
                        token_type: "Bearer",
                        expires_in: 3600
                    })
            };
        };

        const authConfig = {
            type: "oauth2_client_credentials",
            tokenUrl: "https://idp.example.org/realms/hospital/protocol/openid-connect/token",
            clientId: "fhir-converter",
            clientSecretRef: "env://OAUTH_SECRET",
            scope: "system/*.write",
            audience: "https://fhir.example.org"
        };

        assert.strictEqual(isRefreshableAuth(authConfig), true);
        assert.strictEqual(isRefreshableAuth({auth: "bearer", token: "static"}), false);

        const h1 = await buildOutboundHeaders(authConfig, {secretResolver, fetchImpl});
        const h2 = await buildOutboundHeaders(authConfig, {secretResolver, fetchImpl});
        assert.strictEqual(h1.Authorization, "Bearer oauth-tok-1");
        assert.strictEqual(h2.Authorization, "Bearer oauth-tok-1");
        assert.strictEqual(tokenCalls.length, 1);

        const postedParams = new URLSearchParams(tokenCalls[0].init.body);
        assert.strictEqual(postedParams.get("grant_type"), "client_credentials");
        assert.strictEqual(postedParams.get("client_id"), "fhir-converter");
        assert.strictEqual(postedParams.get("client_secret"), "client-secret-v1");
        assert.strictEqual(postedParams.get("scope"), "system/*.write");
        assert.strictEqual(postedParams.get("audience"), "https://fhir.example.org");

        // Rotate underlying secret and invalidate on simulated 401
        env.OAUTH_SECRET = "client-secret-v2";
        invalidateAuthSecrets(authConfig, secretResolver);

        const h3 = await buildOutboundHeaders(authConfig, {secretResolver, fetchImpl});
        assert.strictEqual(h3.Authorization, "Bearer oauth-tok-2");
        assert.strictEqual(tokenCalls.length, 2);
        const retryParams = new URLSearchParams(tokenCalls[1].init.body);
        assert.strictEqual(retryParams.get("client_secret"), "client-secret-v2");
    });

    it("rejects non-http OAuth2 tokenUrl and malformed auth configurations with status 400", async function () {
        await assert.rejects(
            () =>
                buildOutboundHeaders({
                    type: "oauth2_client_credentials",
                    tokenUrl: "file:///etc/passwd",
                    clientId: "id",
                    clientSecret: "sec"
                }),
            {status: 400}
        );
        await assert.rejects(
            () =>
                buildOutboundHeaders({
                    type: "api_key",
                    headerName: "Bad\r\nHeader",
                    apiKey: "abc"
                }),
            {status: 400}
        );
        await assert.rejects(() => buildOutboundHeaders({type: "kerberos"}), {status: 400});
    });
});
