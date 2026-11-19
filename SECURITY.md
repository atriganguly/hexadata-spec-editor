# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it and the
impact you expect. You will get an acknowledgement, and a fix or a decision on the report as soon as it can be
reviewed.

## Scope

The PDF engine (`apps/pdf-server`) renders user-supplied content in a headless browser, so the areas that matter most
are:

- markup or script injection through sheet content, pasted HTML or `.hxspec` imports;
- anything that lets the renderer reach the network, the filesystem or internal addresses;
- bypasses of input validation, size limits, the origin allow-list or the rate limit;
- denial of service against the renderer (resource exhaustion, queue starvation).

The design and its guarantees are described in the README's "Security model" and in `AGENTS.md` (hard rules 3 and 4).

## Supported versions

Only the latest commit on `main` is supported.

## Deployment notes

The service has no accounts and is meant for a trusted team behind the `ALLOWED_ORIGINS` allow-list. Put
authentication in front of it before exposing it publicly.
