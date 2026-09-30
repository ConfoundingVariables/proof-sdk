import { Router, type Request, type Response } from 'express';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveShareMarkdownAuthMode } from './hosted-auth.js';
import {
  AGENT_DOCS_PATH,
  ALT_SHARE_TOKEN_HEADER_FORMAT,
  AUTH_HEADER_FORMAT,
  CANONICAL_CREATE_API_PATH,
} from './agent-guidance.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const discoveryRoutes = Router();

function trustProxyHeaders(): boolean {
  const value = (process.env.PROOF_TRUST_PROXY_HEADERS || '').trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
}

function getPublicBaseUrl(req: Request): string {
  if (trustProxyHeaders()) {
    const forwardedProtoHeader = req.header('x-forwarded-proto');
    const forwardedHostHeader = req.header('x-forwarded-host');
    const forwardedProto = typeof forwardedProtoHeader === 'string'
      ? forwardedProtoHeader.split(',')[0]?.trim()
      : '';
    const forwardedHost = typeof forwardedHostHeader === 'string'
      ? forwardedHostHeader.split(',')[0]?.trim()
      : '';
    if (forwardedProto && forwardedHost) {
      return `${forwardedProto}://${forwardedHost}`;
    }
  }

  const configuredBase = (process.env.PROOF_PUBLIC_BASE_URL || '').trim();
  if (configuredBase) {
    return configuredBase.replace(/\/+$/, '');
  }

  const host = req.get('host') || '';
  if (!host) return '';
  return `${req.protocol || 'http'}://${host}`;
}

const textSearchDirs = [
  path.resolve(__dirname, '..'),
  path.resolve(process.cwd()),
];

function loadRepoText(fileName: string): string | null {
  for (const dir of textSearchDirs) {
    try {
      return readFileSync(path.join(dir, fileName), 'utf8');
    } catch {
      // continue
    }
  }
  return null;
}

function loadAgentDocsMarkdown(): string | null {
  const docs = loadRepoText(path.join('docs', 'agent-docs.md'));
  if (docs) return docs;
  return loadRepoText('AGENT_CONTRACT.md');
}

discoveryRoutes.get('/.well-known/agent.json', (req: Request, res: Response) => {
  const base = getPublicBaseUrl(req);
  const apiBase = base ? `${base}/api` : '/api';
  const docsUrl = base ? `${base}${AGENT_DOCS_PATH}` : AGENT_DOCS_PATH;
  const skillUrl = base ? `${base}/proof.SKILL.md` : '/proof.SKILL.md';
  const setupUrl = base ? `${base}/agent-setup` : '/agent-setup';
  const shareBase = base || '';

  const authMode = resolveShareMarkdownAuthMode(base);
  const authMethods = authMode === 'none'
    ? ['none']
    : authMode === 'api_key'
      ? ['api_key']
      : authMode === 'oauth_or_api_key'
        ? ['api_key', 'oauth']
        : ['oauth'];

  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({
    name: 'Proof Editor',
    description: 'Agent-native markdown editor with collaborative sharing and provenance tracking',
    api_base: apiBase,
    docs_url: docsUrl,
    skill_url: skillUrl,
    setup_url: setupUrl,
    capabilities: ['create_document', 'share', 'comment', 'suggest', 'rewrite', 'collab', 'provenance'],
    auth: {
      methods: authMethods,
      api_key_header: 'Authorization: Bearer <key>',
      no_auth_allowed: authMode === 'none',
      shared_link: {
        token_from_url: '?token=<token>',
        preferred_header: AUTH_HEADER_FORMAT,
        alt_header: ALT_SHARE_TOKEN_HEADER_FORMAT,
      },
    },
    quickstart: {
      received_link: {
        description: 'Given a Proof share URL, read it (and discover state/ops) in one step.',
        method: 'GET',
        url: `${shareBase}/d/{slug}?token={token}`,
        headers: { Accept: 'application/json' },
        returns: 'markdown + _links + agent.auth',
      },
      create_and_share: {
        method: 'POST',
        url: CANONICAL_CREATE_API_PATH,
        body: { markdown: '# Hello World', title: 'My Document' },
        returns: 'shareUrl (editable link to share with anyone)',
      },
    },
  });
});

discoveryRoutes.get('/AGENT_CONTRACT.md', (_req: Request, res: Response) => {
  const contract = loadRepoText('AGENT_CONTRACT.md');
  if (!contract) {
    res.status(404).type('text/plain').send('AGENT_CONTRACT.md not found');
    return;
  }
  res.type('text/markdown; charset=utf-8').send(contract);
});

discoveryRoutes.get('/agent-docs', (_req: Request, res: Response) => {
  const doc = loadAgentDocsMarkdown();
  if (!doc) {
    res.status(404).type('text/plain').send('agent-docs not found');
    return;
  }
  res.type('text/markdown; charset=utf-8').send(doc);
});

discoveryRoutes.get('/proof.SKILL.md', (req: Request, res: Response) => {
  const skill = loadRepoText(path.join('docs', 'proof.SKILL.md'));
  if (!skill) {
    res.status(404).type('text/plain').send('proof.SKILL.md not found');
    return;
  }
  const base = getPublicBaseUrl(req) || `http://127.0.0.1:${process.env.PORT || '4000'}`;
  const localized = skill.replace(/http:\/\/localhost:4000/g, base);
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.type('text/markdown; charset=utf-8').send(localized);
});

discoveryRoutes.get('/agent-setup', (req: Request, res: Response) => {
  const base = getPublicBaseUrl(req) || `http://127.0.0.1:${process.env.PORT || '4000'}`;
  res.type('text/markdown; charset=utf-8').send(`# Proof — Agent Setup

This is a self-hosted Proof SDK deployment. Base URL: \`${base}\`

## Web-first Quickstart

Install the unified Proof skill once, then collaborate over HTTP:

Claude Code:

    mkdir -p ~/.claude/skills/proof && curl -fsSL ${base}/proof.SKILL.md -o ~/.claude/skills/proof/SKILL.md

Codex (installs to ~/.codex/skills/proof/SKILL.md):

    mkdir -p ~/.codex/skills/proof && curl -fsSL ${base}/proof.SKILL.md -o ~/.codex/skills/proof/SKILL.md

pi / generic agents with a skills directory:

    mkdir -p ~/.agents/skills/proof && curl -fsSL ${base}/proof.SKILL.md -o ~/.agents/skills/proof/SKILL.md

The canonical setup reference for SDK deployments is http://localhost:4000/agent-setup
(override the port to match your deployment).

## Collaborate on a document

A human shares a link like <${base}/d/<slug>?token=<token>> with you. That URL is the invite:

- Read markdown: curl -H "Accept: text/markdown" "${base}/d/<slug>?token=<token>"
- Read state: GET ${base}/documents/<slug>/state with header "Authorization: Bearer <token>"
- Edit: POST ${base}/documents/<slug>/edit, /edit/v2, or /ops
- Presence: send header "X-Agent-Id: ai:<agent-id>" so humans see you in the doc

Include "by" (e.g. "by":"ai:codex") on every write.

## Full reference

- Docs: ${base}/agent-docs
- Contract: ${base}/AGENT_CONTRACT.md
- Discovery: ${base}/.well-known/agent.json
`);
});
