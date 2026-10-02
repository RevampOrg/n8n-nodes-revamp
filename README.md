# Revamp for n8n

Create or redesign websites from your workflows. Turn an approved brief into a
new website, start a redesign from a public website URL, and send the available
preview back to your form, spreadsheet or CRM. Continue in [Revamp](https://revamp.dev/?utm_source=n8n&utm_medium=integration)
to refine your website visually or by chatting and publish when you're ready.

## Operations

| Operation | Input | Result |
| --- | --- | --- |
| Create Website | Website name, instructions, request reference | Project ID, submission ID, status, Studio link |
| Redesign Website | Website name, public URL, request reference; optional instructions | Project ID, submission ID, status, Studio link |
| Check Project | Project ID and submission ID from the starting operation | Status, latest reply, available preview link, Studio link |

Creation and redesign also accept an optional existing agency client folder ID.
They start a new website project. Editing and publishing remain available in
Revamp. This node does not replace or change the original website.

## Requirements and installation

- A Revamp account. Creation and redesign use that account's credits and plan.
- Use a current n8n release; the initial connection implementation targets
  n8n 2.41.6 or later and its automatic OAuth client registration support.
- Package: `n8n-nodes-revamp`.

The package is [published on npm](https://www.npmjs.com/package/n8n-nodes-revamp).
It is **not yet verified by n8n**. Self-hosted instance owners can install it
under **Settings → Community Nodes**. Once n8n
approves verification, instances with verified community nodes enabled can
discover and install **Revamp** from the node picker, including n8n Cloud.

## Credentials

Create a **Revamp OAuth2 API** credential and click **Connect my account**.
Sign in to your own Revamp account and approve the connection. You do not need
to copy an API key, client ID or client secret. n8n discovers Revamp's existing
authorization service and registers its exact callback automatically. It owns
the connection tokens, renewal and reconnect flow. Native Cloud and self-hosted
connection and renewal have not yet been verified end to end.

Your n8n instance receives permission to work with your Revamp projects.
Connect a dedicated test account for review rather than an administrator account.
Deleting a credential in n8n does not delete websites or cancel a subscription;
credential deletion is not a claim of remote token revocation.

## Example workflow

1. A form or CRM supplies a website name, brief and stable source-record ID.
2. **Revamp → Create Website** maps those values to **Website Name**,
   **Instructions**, and **Request Reference**.
3. Save the returned `projectId` and `submissionId` with the source record.
4. Add a Wait step, then **Revamp → Check Project** using both returned IDs.
5. Record the progress and the available `previewUrl`, or open `studioUrl` to
   continue in Revamp. For longer jobs, schedule another bounded check.

Import [`examples/create-and-check.json`](examples/create-and-check.json) for a
manual, unscheduled starting workflow. Assign your own credential before running.
Use an explicit new source reference for another website.

### Safe retries

Keep the **Request Reference** and all inputs unchanged when retrying a request.
The node derives a stable identifier scoped to your Revamp account and action,
so retrying does not intentionally create a second project. A new reference
starts a new project. References must be unique across workflows that create
the same kind of project for the same account. Use a source-record ID with a
workflow prefix, such as `approved-brief:12345`; avoid a new random value or
execution ID on each retry. Save the reference upstream before starting work.

An interrupted response may mean Revamp already accepted the request. Retry
with the original reference instead of starting a new request.

### Understanding progress

Generation runs in the background; no Studio tab needs to stay open. `status`
describes the agent request, not proof of a successful website build. A
`previewUrl` is the latest available preview and can predate the requested
change. `null` means no status, reply or preview was available at that check.
The node preserves those values and does not label an unknown result successful.
Avoid tight polling loops and automatic re-creation after a failed check.

### Errors

Revamp's account ownership, input validation and credit enforcement apply to
every operation. A tool failure is a failed n8n execution even when the HTTP
response is 200. n8n's **Continue On Fail** setting emits an `error` field for
the affected item while keeping the remaining items paired with their inputs.
HTTP exceptions are summarized without copying tokens or upstream traces.
For expired or revoked access, reconnect the credential. Private/local website
addresses are rejected by Revamp; provide a publicly accessible website URL.

## Data and privacy

The node sends the supplied website instructions, public URL and optional client
folder ID to Revamp. Account connection alone does not start generation or spend
credits. It reads the connected account identifier to namespace creation retries.
Requests go only to `app.revamp.dev` and do not follow redirects. There are no
runtime dependencies, filesystem access or environment reads in the node.

Inputs and returned results can appear in your own n8n execution history under
your instance's retention/access settings. This package does not introduce a
separate customer database, analytics collector or billing system. Existing
legacy Revamp projects remain unchanged.

## Development

Use Node 24 and pnpm 10:

```sh
pnpm install --ignore-workspace
pnpm lint
pnpm test
```

Tests exercise the compiled node's parameter mapping, authenticated helper
wiring, retry namespaces, item pairing, validation, error handling and null
progress semantics. They are wiring tests, not native n8n execution or OAuth
verification. They make no production, model or build requests.

The Revamp monorepo also contains a separate local integration suite at
`apps/app/test/n8n/revamp.boundary.ts`. After building this package, run it from
the monorepo root with:

```sh
pnpm --dir apps/app exec vitest run --config test/n8n/vitest.config.ts
```

It exercises this compiled node through Revamp's real authorization, registered
tools and isolated D1 project storage, including account permissions, credits,
private URL rejection, retry behavior and public-client consent/PKCE/renewal.
The downstream generation service is a deterministic local fixture; these
checks do not generate a website or replace a native n8n connection check.

The node reuses Revamp's deployed JSON MCP transport at `/api/make/mcp`.
That path is shared transport, despite its historical name; permissions,
generation and billing stay in Revamp. The public
[tool schemas](https://app.revamp.dev/.well-known/mcp/server-card.json) describe
the underlying operations. No production backend deployment is needed for
this package.

## Publication

The public source repository is
[`RevampOrg/n8n-nodes-revamp`](https://github.com/RevampOrg/n8n-nodes-revamp).
Public author: **Revamp Staff**, `contact@revamp.dev`.

The `publish.yml` workflow builds and checks a tagged release, then publishes
to npm with provenance. For the first publication, configure a short-lived
granular npm token authorized to create this package as the repository's
`NPM_TOKEN` secret; do not put a token in source or chat. After the package
exists, configure npm Trusted Publishing for repository owner `RevampOrg`,
repository `n8n-nodes-revamp`, workflow `publish.yml`, allowing direct publication,
then revoke the bootstrap token and remove the repository secret.
Only push a release tag after the source commit has been pushed and approved.

After publication, submit the npm package in the
[n8n Creator Portal](https://creators.n8n.io/nodes). Approval and in-editor
discovery are separate from npm publication; neither is claimed here.

## Support and policies

- [Website](https://revamp.dev/)
- [Support](https://revamp.dev/support/)
- [Privacy](https://revamp.dev/privacy/)
- [Terms](https://revamp.dev/terms/)
- Publisher contact: **Revamp Staff**, `contact@revamp.dev`

## Official references

- [Community node verification requirements](https://docs.n8n.io/connect/create-nodes/build-your-node/reference/verification-guidelines)
- [Publication and verification](https://docs.n8n.io/connect/create-nodes/deploy-your-node/submit-community-nodes)
- [Official scaffolder](https://docs.n8n.io/connect/create-nodes/build-your-node/using-the-n8n-node-tool)
