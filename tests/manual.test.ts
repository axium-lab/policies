import { expect, it } from 'vitest';

import { policy } from '@axium-lab/policies';

it('compone las tres policies y devuelve el JSON final', () => {
  const policies = policy()
    .set('cache', { mode: 'semantic', ttl_seconds: 600 })
    .set('capture', { samples: true })
    .set('firewall', {
      inbound: {
        default_action: 'deny',
        rules: [{ action: 'allow', type: 'cidr', value: '192.168.1.7' }],
      },
      outbound: {
        rules: [{ action: 'deny', type: 'domain', value: '*.evil.com' }],
      },
    })
    .build();

  console.log(JSON.stringify(policies, null, 2));

  expect(policies.cache?.min_similarity).toBe(0.95);          // relleno por ser semantic
  expect(policies.capture?.samples).toBe(true);
  expect(policies.firewall?.inbound.rules[0]?.value).toBe('192.168.1.7/32'); // canonicalizado
  expect(policies.firewall?.outbound.default_action).toBe('allow');          // default materializado
});
