# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting (**Security → Report a vulnerability**) on this repository, or contact the maintainer directly. Include steps to reproduce and the affected version. You will get an acknowledgement, and a fix or a mitigation plan before any public disclosure.

## Supported versions

Only the latest release receives security fixes.

## What is already in place (server mode)

- Passwords hashed with scrypt; sessions in `HttpOnly` + `SameSite` cookies, stored hashed.
- CSRF protection (custom header + origin check) and a strict Content-Security-Policy.
- Rate limiting on login, password reset and registration; no account enumeration.
- Server-side authorisation for every request (membership and role); full isolation between companies.
- Single-use, expiring, hashed tokens for activation, reset and invitations.

## Operating it safely

- Serve it **only behind HTTPS** (the supplied Docker + Caddy setup does this). The Node process itself speaks plain HTTP.
- Keep `.env` out of version control; use a dedicated SMTP account or app password.
- Copy `data/backups/` off the server regularly.
- Never commit databases, Excel workbooks or customer exports to this repository. If real data was committed by mistake, treat it as leaked: remove it from the history (`git filter-repo`) **and** rotate anything secret.
