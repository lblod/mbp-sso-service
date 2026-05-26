# mbp-sso-service

Microservice that implements the SSO token exchange flow between **Mijn Burgerprofiel (MBP)** and the LokaalBeslist embed application, using **Vlaams Toegangsbeheer (ACM/IDM)** as identity provider.

Part of the [LBLOD](https://lblod.github.io) (Lokaal Bestuur Linked Open Data) stack, built on the [mu-semtech](https://mu.semte.ch) microservice framework.

## Flow

```
1. MBP backend  ──POST /auth/v1/token──►  this service
                                           validates ACM token via introspection
                                           upserts user account in triplestore
                                           ◄── { token: "<handover-token>" }

2. MBP opens the embed URL:  https://embed.example.com/?handover=<handover-token>

3. Embed frontend  ──POST /auth/v1/exchange──►  this service
                                                redeems handover token (single-use)
                                                creates session in triplestore
                                                ◄── 201 + Set-Cookie: mu_session_id

4. Embed frontend  ──DELETE /auth/v1/session──►  this service
                                                  removes session (logout)
                                                  ◄── 204 + Clear-Cookie
```

The ACM access token is stored exclusively on the backend and is never forwarded to the frontend.

## API

### `POST /auth/v1/token`

Called server-to-server by the MBP backend.

**Request body**
```json
{ "token": "<acm-access-token>" }
```

**Success response** `200`
```json
{ "token": "<handover-token>" }
```

The handover token is short-lived (default 5 minutes) and single-use.

**Error responses**

| Status | Reason |
|--------|--------|
| `400` | `token` field missing |
| `401` | ACM introspection rejected the token (inactive, expired, wrong audience) |
| `502` | Could not reach ACM introspection endpoint |

---

### `POST /auth/v1/exchange`

Called by the embed frontend immediately after the page loads with the handover token from the URL query string.

**Request body**
```json
{ "token": "<handover-token>" }
```

**Success response** `201`
```json
{
  "data": {
    "type": "sessions",
    "id": "<session-id>",
    "attributes": {
      "firstName": "Jan",
      "lastName": "Janssen"
    }
  }
}
```

Sets a `mu_session_id` cookie (`HttpOnly`, `SameSite=lax`, `Secure` in production).

**Error responses**

| Status | Reason |
|--------|--------|
| `400` | `token` field missing |
| `401` | Handover token not found, already used, or expired |

---

### `DELETE /auth/v1/session`

Called by the embed frontend on logout. Reads the `mu_session_id` cookie, removes the session from the triplestore, and clears the cookie.

**Success response** `204` (no body)

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `ACM_INTROSPECTION_URL` | yes | — | ACM token introspection endpoint |
| `ACM_CLIENT_ID` | yes | — | OAuth2 client ID registered with ACM |
| `ACM_CLIENT_SECRET` | yes | — | OAuth2 client secret |
| `MU_SPARQL_ENDPOINT` | yes | — | SPARQL endpoint of the triplestore (set by the stack) |
| `HANDOVER_TOKEN_TTL_SECONDS` | no | `300` | Lifetime of handover tokens in seconds |
| `NODE_ENV` | no | — | Set to `production` to enable the `Secure` cookie flag |

## Running locally

This service is designed to run as part of a Docker Compose stack. A minimal setup requires a triplestore (e.g. Virtuoso) and the correct environment variables.

```yaml
sso:
  build: ./mbp-sso-service
  environment:
    ACM_INTROSPECTION_URL: "https://authenticatie-ti.vlaanderen.be/op/v1/token/introspect"
    ACM_CLIENT_ID: "your-client-id"
    ACM_CLIENT_SECRET: "your-client-secret"
    MU_SPARQL_ENDPOINT: "http://database:8890/sparql"
```

## Triplestore data model

Sessions and accounts are stored in `<http://mu.semte.ch/graphs/sessions>`.

**User account** (created on first login, keyed on ACM `sub`)
```
<http://data.lblod.info/id/accounts/{uuid}>
  a foaf:OnlineAccount ;
  mu:uuid "{uuid}" ;
  ext:acmId "{acm-sub}" ;
  foaf:accountName "{preferred_username}" ;
  ext:rijksregisternummer "{rrn}" .         # only present when the rrn claim is in the token
```

The `rrn` claim must be released by ACM/IDM in the token introspection response — this requires the client to be configured with a scope that exposes it (e.g. the `vo` scope on Vlaanderen ACM/IDM). When the claim is missing, the account is stored without an RRN and the field is back-filled on the next login that does carry the claim. Downstream services (e.g. `mbp-notification-service`) read the RRN from this graph to address MBP-inbox notifications.

**Session**
```
<http://mu.semte.ch/sessions/{uuid}>
  mu:uuid "{uuid}" ;
  ext:sessionAccount <http://data.lblod.info/id/accounts/{uuid}> ;
  dcterms:created "{datetime}" ;
  dcterms:modified "{datetime}" .
```

## Security

- ACM access tokens are never forwarded to the frontend
- Handover tokens are single-use and expire after 5 minutes (configurable)
- Session cookies are `HttpOnly` and `Secure` (in production)
- Token audience is validated against `ACM_CLIENT_ID` during introspection
