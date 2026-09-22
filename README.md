# @axium-lab/policies

Validación y composición de los documentos de policy de un proxy app. El frontend las
compone, el backend las valida antes de escribirlas en `rm.proxy_apps.policies`.

Isomorfa (navegador, Node y Bun) y sin dependencias de runtime: `zod` es una
`peerDependency`.

```bash
npm install @axium-lab/policies zod
```

## Uso en el backend

```ts
import { parsePolicies } from '@axium-lab/policies';

const result = parsePolicies(req.body.policies);

if (!result.ok) {
  return res.status(400).json({
    status: false,
    error: { code: 'VALIDATION_ERROR', message: 'Error de validación', details: result.errors },
  });
}

await knex('rm.proxy_apps').where({ id }).update({ policies: result.value });
```

`result.errors` ya trae `field` en el formato que devuelve la API (`firewall.inbound.rules.1.value`),
más `path` como array para marcar el campo en un formulario y un `code` estable para i18n.

`result.warnings` no bloquea: son reglas que no hacen lo que probablemente se esperaba
(duplicadas, inalcanzables, redundantes).

## Uso en el runtime del proxy

```ts
import { resolvePolicies } from '@axium-lab/policies';

const policies = resolvePolicies(row.policies); // todas las secciones presentes
policies.firewall.inbound.default_action;
```

## Uso en el frontend

```ts
import { policy, policiesJsonSchema } from '@axium-lab/policies';

const draft = policy().set('firewall', {
  inbound: { default_action: 'deny', rules: [{ action: 'allow', type: 'cidr', value: '10.0.0.0/8' }] },
});

const result = draft.safeBuild();   // valida en cliente antes de enviar
const schema = policiesJsonSchema(); // JSON Schema para pintar el formulario
```

El builder es inmutable: cada `set()` / `remove()` devuelve uno nuevo.

## El documento

Una sección existe **solo si se configuró**. Una app sin nada configurado es
`{ "version": 1 }`, que encaja con el `DEFAULT '{}'` de la columna. Dentro de una sección
presente, los defaults sí se materializan.

```jsonc
{
  "version": 1,
  "firewall": {
    "inbound":  { "default_action": "deny",  "rules": [{ "action": "allow", "type": "cidr", "value": "10.0.0.0/8" }] },
    "outbound": { "default_action": "allow", "rules": [{ "action": "deny", "type": "domain", "value": "*.evil.com" }] }
  }
}
```

Reglas ordenadas: **la primera que casa, gana**. `inbound` solo admite `cidr`; `outbound`
admite `cidr` y `domain`. Los valores se canonicalizan al validar (`10.0.0.1/8` → `10.0.0.0/8`,
`WWW.Evil.COM.` → `www.evil.com`).

La raíz conserva las claves que no conoce, para que un despliegue antiguo no borre en
silencio una sección escrita por uno nuevo. Dentro de cada sección conocida, una clave
desconocida sí es un error.

## Estado

| Policy | Estado |
|---|---|
| `firewall` | ✅ |
| `cache` | pendiente |
| `capture` | pendiente |
| `geo` | pendiente |
| `dlp` | pendiente |
| `transformations` | pendiente |

El diseño completo y las decisiones tomadas están en [DESIGN.md](./DESIGN.md).
