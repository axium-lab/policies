import { expect, it } from 'vitest';

import { policy } from '@axium-lab/policies';

it('añade una IP al firewall y devuelve el JSON final', () => {
  const policies = policy()
    .set('firewall', {
      inbound: {
        default_action: 'deny',
        rules: [{ action: 'allow', type: 'cidr', value: '192.168.1.7' }],
      },
    })
    .build();

  console.log(JSON.stringify(policies, null, 2));

  expect(policies.firewall?.inbound.rules[0]?.value).toBe('192.168.1.7/32');
});
