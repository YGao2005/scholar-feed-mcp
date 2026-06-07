<!--
Filled from privacy-policy.draft.md on 2026-06-03 with the operator's details.
Not legal advice. Heroku as the hosting provider is inferred from project
context; confirm or correct it.
-->

# Privacy Policy

**Effective date:** June 3, 2026

Scholar Feed ("we", "us"), operated by Yang Gao, an individual based in California,
USA, provides the website at scholarfeed.org, the API at api.scholarfeed.org, and
the `scholar-feed-mcp` client. This policy explains what we collect, why, and your
choices.

## The short version

- You can use the research API anonymously (no account, no key). Anonymous use is
  rate-limited and we record minimal request metadata to enforce that limit.
- With a free or Pro account, we store your account details, your API usage, and
  the library, collections, and watches you create.
- We process the content of your requests (including search queries and the papers
  you fetch or act on) to operate, secure, and improve the service.
- We do not sell your personal information.

## What we collect

**Account data (accounts only).** Your email address and authentication details,
your subscription tier and billing status, and the API keys you generate.

**Content you create (accounts only).** Saved papers, collections, likes, and
watches, which power your personalized feed and the email digest.

**Usage and request data.** For each API call we log request metadata: the tool
called, whether the call was anonymous or keyed, your account identifier (if any),
the response status, a derived client identifier used for anonymous rate limiting,
and a per-session identifier (see below). For some tools we also log the request
content, such as the text of a search query or the arXiv identifier of a paper you
fetch, so we can operate the service, debug it, measure which features are used,
and improve relevance. Raw request logs are retained for up to 90 days; aggregated,
de-identified usage counts are retained longer.

**Session identifier.** The `scholar-feed-mcp` client generates a random identifier
once per running process and sends it with each request (the `X-SF-Session` header)
so we can group one assistant session's calls together. It is random, contains no
personal or device information, and is not linked to your identity unless you are
using an API key.

**Payment data.** Subscription payments are handled by our payment processor,
Stripe. We do not store full card numbers; we receive only the subscription status
needed to grant access. Stripe's handling of your payment information is governed by
Stripe's own privacy policy.

## What the MCP client sends

`scholar-feed-mcp` runs locally on your machine. It transmits your requests to
api.scholarfeed.org, attaching your `SF_API_KEY` (if you set one) and the random
session identifier above. Your API key is stored in your own MCP client's local
configuration file, not by us beyond what is needed to authenticate the key. The
client sends no other telemetry.

## How we use data

- Provide and secure the service, and enforce rate limits and quotas.
- Operate accounts, subscriptions, and the email digest.
- Personalize your feed and recommendations from the papers you save and like.
- Understand which features are used and where results come up empty, to prioritize
  improvements.

## Sharing and processors

We share data only with service providers that help us run the product, under
agreements that limit their use of it:

- Hosting and infrastructure: Heroku.
- Database and authentication: Supabase.
- Machine learning services: Google (the Gemini API) for text embeddings, and
  DeepSeek for paper summaries. When you use a feature that calls these, the
  relevant request content (for example the text you embed, or paper text we
  summarize) is processed by that provider under its own terms.
- Payments: Stripe.
- Email delivery: Resend (which sends our digest mail from mail.scholarfeed.org).

Paper metadata originates from public sources including arXiv. We do not sell your
personal information. We may disclose data if required by law or to protect the
service and its users.

## Retention

Raw API request logs are retained for up to 90 days, then deleted. Aggregated usage
statistics, your account, and the content you create are retained for as long as
your account is active or as needed to provide the service. You can delete your
saved content at any time through the API or the website.

## Your choices and rights

- Use the API anonymously, without an account or key.
- Access, export, or delete your account data by contacting us, subject to
  applicable law. Depending on where you live, you may have rights under the EU or
  UK GDPR (if you are in those regions) or the California Consumer Privacy Act
  (CCPA, if you are a California resident); we honor verified requests.
- Stop email digests using the unsubscribe link in any digest.
- Remove your API key from your MCP configuration to return to anonymous use.

## Children

The service is not directed to children under 13, and we do not knowingly collect
their personal information.

## Changes

We may update this policy. Material changes will be noted on this page with a new
effective date.

## Contact

Questions or requests: yang@mail.scholarfeed.org.
