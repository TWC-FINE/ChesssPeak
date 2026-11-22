import { describe, expect, it } from 'vitest';
import { agentEnv } from '../src/env.js';

describe('agentEnv', () => {
  it('reads AGENT_PORT from the environment even when .env does not have it, so a second agent can use 8766', () => {
    expect(agentEnv({ WHISPER_SERVER_PATH: 'w' }, { AGENT_PORT: '8766' })).toEqual({ WHISPER_SERVER_PATH: 'w', AGENT_PORT: '8766' });
  });

  it('lets the environment win over .env for the runtime keys', () => {
    const env = agentEnv({ AGENT_PORT: '8765', LB_TIMEOUT_MS: '15000' }, { AGENT_PORT: '8766', LB_TIMEOUT_MS: '45000', WHISPER_URLS: 'http://127.0.0.1:18201' });
    expect(env).toMatchObject({ AGENT_PORT: '8766', LB_TIMEOUT_MS: '45000', WHISPER_URLS: 'http://127.0.0.1:18201' });
  });

  it('keeps .env as it is without those keys in the environment: one agent on 8765, as before', () => {
    expect(agentEnv({ AGENT_ALLOWED_ORIGINS: 'http://127.0.0.1:5500' }, { PATH: 'x' })).toEqual({ AGENT_ALLOWED_ORIGINS: 'http://127.0.0.1:5500' });
  });

  it('takes nothing else from the environment, so the origins and the host still come only from .env', () => {
    const env = agentEnv({}, { AGENT_HOST: '0.0.0.0', AGENT_ALLOWED_ORIGINS: 'https://example.com', WHISPER_URLS_EXTRA: 'x', PATH: 'x' });
    expect(env).toEqual({});
  });
});
