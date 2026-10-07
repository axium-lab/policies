# axium-policies — diseño

> Estado: **fase 1 (firewall) implementada**. Fases 2-6 pendientes.
> Última actualización: 2026-09-22

Librería TypeScript para **componer y validar documentos de policy** de un proxy app.
El frontend las construye, el backend las valida antes de persistir.

---

## 1. Contexto confirmado

Datos verificados contra el repo de la API (sesión `api`, solo lectura):

| Hecho | Detalle |
|---|---|
| Dónde vive | Columna `policies JSONB NOT NULL DEFAULT '{}'` en `rm.proxy_apps` |
| Forma | **Un sobre** con secciones opcionales. Una fila por app. No hay tabla `policies` ni columna `type` |
| Validación en DB | **Ninguna**. Cero CHECK constraints. Esta librería es la única barrera |
| Niveles | Uno solo (app). Sin herencia, sin merge en cascada — el Request Manager va a desaparecer |
| Stack backend | Postgres + Knex 3 + driver `pg` 8, runtime **Bun** |
| Fuera del documento | `rate_limit_rpm`, `rate_limit_tpm`, `budget_*` son columnas (contadores, necesitan UPDATE atómico) |

⚠️ El bump de schema que añade la columna **está sin aplicar**: solo aparece en instalaciones frescas.

### Decisiones tomadas

1. **Firewall** = capa de red (dominios / IPs / CIDRs). Es nuevo, no existe nada en el repo.
2. **Una sección existe solo si se configuró.** Dentro de una sección que existe, los
   defaults sí se materializan. Una app sin configurar es `{ "version": 1 }`.
3. **Zod 4**, y la API se adapta. → ver acción pendiente en §8.
4. **La librería la importa también el frontend** ⇒ isomorfa, sin dependencias de `node:*`.

---

## 2. Forma del documento

```jsonc
{
  "version": 1,
  "cache":   { "mode": "off", "ttl_seconds": null },
  "capture": { "samples": false },
  "dlp":     { "enabled": true, "options": { "countries": ["ES"], "policy": { "default": "mask" } } },
  "geo":     { "allow": ["EU"], "on_violation": "block" },
  "transformations": [{ "type": "pdf_to_markdown", "options": {} }],
  "firewall": { /* §4 */ }
}
```

- **Entrada**: todas las secciones opcionales (una fila existente puede ser `{}`).
- **Salida de `parse()`**: las secciones ausentes siguen ausentes; las presentes van
  completas, con defaults materializados y orden de claves estable.
- **Salida de `resolve()`**: todas las secciones presentes. Es lo que consume el runtime
  del proxy, **no** lo que se escribe en la base de datos.

La canonicalización no es cosmética: hace que dos policies equivalentes sean byte-idénticas,
lo que permite comparar, hashear (ETag / idempotencia) y que el diff de auditoría no dé
falsos positivos por reordenación.

### Claves desconocidas

`passthrough` en la raíz + `strict` dentro de cada sección conocida.

- Raíz permisiva: un backend viejo que haga read-modify-write **no borra en silencio** una
  sección escrita por uno nuevo.
- Secciones estrictas: un typo dentro de `cache` sí es un error, no se traga.

---

## 3. Catálogos de enums

⚠️ **Esto no existe en ninguna parte.** Los comentarios del schema dicen que el catálogo
"vive en el código de la app", y ese código no está escrito. Esta librería es el primer
sitio donde se define. **Cada lista hay que validarla antes de congelarla.**

| Campo | Valores | Procedencia |
|---|---|---|
| `cache.mode` | `off` \| `strict` \| `semantic` | ✅ Real: `rm.cache_mode_enum` en Postgres |
| `cache.ttl_seconds` | entero 1 – 2 592 000 (30 días), o `null` | ✅ decidido en la fase 2 |
| `cache.min_similarity` | 0 – 1, default `0.95` | ✅ decidido en la fase 2 |
| `capture.samples` | `boolean`, default `false` | ✅ decidido en la fase 3 |
| `dlp.options.*` (entidades, kinds, países) | Solo patrón, sin catálogo | ✅ El catálogo vive en `@axium-lab/euro-pii` (§4b) |
| `dlp.options.policy.*` (acción) | `mask` \| `block` \| `keep` | ✅ Real: el `Action` de euro-pii |
| `geo.allow[]` | `EU` + ISO 3166-1 alpha-2 | **Inventado en diseño.** Requisito real: "denegar fuera de Europa" |
| `geo.on_violation` | `block` \| `log` | Propuesta (`log` añadido para poder desplegar en modo observación) |
| `transformations[].type` | `pdf_to_markdown`, + ? | Solo ese, en un comentario. **A definir** |

**`semantic` se acepta como valor de primera** (decisión de la fase 2). Que la interfaz lo
enseñe o no es cosa del front; la librería exporta `CACHE_MODES` con los tres. Aceptarlo aquí
no crea la tabla de embeddings: el runtime del proxy tiene que poder honrarlo.

`semantic` **incluye a `strict`**: primero coincidencia exacta por hash, y solo si falla la
búsqueda vectorial. No son alternativas, es un segundo intento después del primero — saltarse
el paso exacto paga un embedding por peticiones que una consulta por hash ya resolvía. Por eso
sigue siendo un enum de tres valores y no dos cachés conviviendo.

**`geo`**: propongo que la librería expanda el alias `EU` a la lista de códigos de país,
de forma que el runtime compare siempre contra códigos ISO y el alias sea azúcar de
configuración. Así "denegar fuera de Europa" es una sola entrada, y sigue siendo posible
afinar por país.

---

## 4. Firewall — ✅ decidido e implementado

**Reglas ordenadas, primera que casa gana.** Dos direcciones separadas:

- **`inbound`** — quién puede llamar a la app. Solo reglas `cidr`: de una petición
  entrante conoces la dirección, no un nombre.
- **`outbound`** — a qué destinos sale el proxy. Reglas `cidr` y `domain`.

```jsonc
"firewall": {
  "inbound": {
    "default_action": "deny",
    "rules": [
      { "action": "deny",  "type": "cidr", "value": "10.13.37.0/24" },
      { "action": "allow", "type": "cidr", "value": "10.0.0.0/8" }
    ]
  },
  "outbound": {
    "default_action": "allow",
    "rules": [{ "action": "deny", "type": "domain", "value": "*.evil.com" }]
  }
}
```

Se descartó whitelist/blacklist porque la precedencia queda implícita y hay casos que no
puede expresar: *"bloquea 10.0.0.0/8 excepto 10.1.0.0/16"* es imposible si la blacklist
siempre gana. Con reglas ordenadas son dos filas en el orden correcto.

**El orden de `rules` no se canonicaliza nunca**: reordenar cambia el comportamiento.

### Canonicalización

| Entrada | Salida |
|---|---|
| `10.0.0.1/8` | `10.0.0.0/8` (bits de host a cero) |
| `192.168.1.7` | `192.168.1.7/32` (IP suelta → red de un host) |
| `2001:0DB8::1/32` | `2001:db8::/32` (RFC 5952) |
| `WWW.Evil.COM.` | `www.evil.com` |
| `ejemplo-ñ.es` | `xn--ejemplo--k3a.es` (punycode vía el `URL` de plataforma) |

### Rechazos deliberados

Sin dependencias externas, la regla es **rechazar lo que no se canonicalice sin ambigüedad**
en lugar de aceptarlo a medias — una regla que no casa por un fallo de normalización es
tráfico que pasa cuando no debía:

- zone IDs (`fe80::1%eth0`)
- octetos con ceros a la izquierda (`010.0.0.1`, que unos resolvers leen en octal)
- IPv4-mapped IPv6 (`::ffff:10.0.0.1`), que nunca casaría con una petición IPv4
- dominios con esquema, puerto, ruta o guion bajo; comodín fuera del prefijo
- una IP declarada como `type: "domain"` y viceversa
- más de 256 reglas por dirección

### Warnings (no bloquean)

`firewall.duplicate_rule`, `firewall.shadowed_rule` (una regla anterior ya decide sobre
ese rango), `firewall.redundant_rule` (repite `default_action` sin tapar a ninguna regla
posterior) y `firewall.blocks_all_traffic` (`0.0.0.0/0` o `::/0` en un `deny`).

### Semántica que el runtime debe implementar

`firewall.inbound` y `geo` son **dos puertas independientes: la petición pasa las dos**.
Un `allow` explícito en el firewall **no** salta el bloqueo geográfico.

Recomendación sin decidir (`capture`): capturar la muestra **después** de que actúe `dlp`.
Guardarla antes persiste justo lo que la policy de DLP decía anonimizar.

## 4b. DLP — ✅ decidido e implementado

Configura `@axium-lab/euro-pii` **sin depender de él**. `options` es su `AnonymizeOptions`
campo a campo; `enabled` es nuestro. Todo lo que va dentro de `options` es contrato de
euro-pii y todo lo de fuera es nuestro, así que un campo que añadamos nunca choca con uno
que añada el motor.

```jsonc
"dlp": {
  "enabled": true,
  "options": {
    "countries": ["ES", "GLOBAL"],   // QUÉ buscar: countries, kinds, entities, except (se intersecan)
    "except": ["DATE_TIME"],
    "policy": {                      // QUÉ hacer: entities > kinds > default
      "default": "mask",
      "kinds":    { "BANK_ACCOUNT": "block" },
      "entities": { "ES_NIF": "keep" }
    }
  }
}
```

**Aquí solo se valida la forma**: nombres `^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$` (`ES_NIF`, no
`dni`), países alfa-2 o `GLOBAL`, el enum de acciones. Copiar el catálogo obligaría a
publicar cada vez que euro-pii añade una entidad (lo hace en minors).

Decisiones:

- **Mapas por especificidad, no reglas ordenadas**: es como resuelve euro-pii, y así el
  mapeo es 1:1.
- **Sin `countries` en `policy`**: país y kind son ejes ortogonales; `ES_NIF` es `ES` y
  `TAX_ID` a la vez y ninguno es más específico. euro-pii tampoco lo tiene.
- **`enabled`, `false` por defecto**: permite pausar sin perder la configuración, y `{}`
  sigue sin hacer nada, como en el resto de secciones (`resolvePolicies` depende de ello).
- **Conjuntos ordenados y sin duplicados; vacíos rechazados**: en euro-pii un campo omitido
  es "sin restringir", y un `[]` es ambiguo.

Errores: `dlp.selection_required` (`enabled: true` sin `countries`, `kinds` ni `entities`;
euro-pii escanearía todo su catálogo, porque `policy` nunca restringe la búsqueda) y
`dlp.block_excepted` (entidad en `except` con `block` explícito; euro-pii lanza).

### Semántica que el runtime debe implementar

- `if (dlp.enabled) anonymize(text, dlp.options)`. Con `enabled: false` **no se llama**.
- La existencia de cada nombre se comprueba contra el catálogo de euro-pii (`ENTITY_NAMES`,
  `supported_kinds()`, `supported_countries()`). Un nombre desconocido con `block` hace
  **fallar** (fail-closed); con `mask` o `keep`, warning y se filtra antes de llamar.
- Una selección que queda vacía tras resolver contra el catálogo es un error del core:
  aquí no se puede saber.
- Un `block` explícito amplía la búsqueda aunque la selección lo excluya; `mask`/`keep` no.

## 5. Superficie de la API

### Por qué no `add_cache()` / `remove_firewall()`

Funciona, pero N tipos × M operaciones = 30-40 funciones escritas a mano, y añadir una
sección obliga a tocar cinco sitios. El riesgo no es el volumen: es que una de esas
funciones se desincronice del validador.

En su lugar, cada sección cumple el contrato `PolicySection` (`src/types/section.ts`) y
se declara una sola vez en su propio fichero: schema, defaults, reglas entre campos y
warnings juntos. `src/policies/index.ts` las lista en `SECTIONS`, y de ahí salen los tipos,
el validador, los defaults y el JSON Schema.

**Añadir una policy = un fichero nuevo en `src/policies/` + una línea en `SECTIONS`.**
Ningún otro fichero del paquete nombra una sección explícitamente.

### Validación (el 90% del uso del backend)

```ts
const result = parsePolicies(input);   // nunca lanza
if (!result.ok) {
  return res.status(422).json({
    status: false,
    error: { code: 'VALIDATION_ERROR', message: 'Error de validación', details: result.errors },
  });
}
await knex('rm.proxy_apps').where({ id }).update({ policies: result.value });
```

- `parsePolicies(input)` → `{ ok: true, value, warnings } | { ok: false, errors }`
- `assertPolicies(input)` → devuelve el documento o lanza (para quien prefiera try/catch)
- `policiesSchema` → el schema de zod crudo, por si la API quiere componerlo con los suyos

### Composición (frontend y tests)

```ts
const doc = policy()
  .set('cache', { mode: 'strict', ttl_seconds: 300 })
  .set('geo',   { allow: ['EU'], on_violation: 'block' })
  .remove('capture')
  .build();                              // valida y materializa defaults

```

Inmutable y encadenable: cada `.set()` devuelve un builder nuevo. `set(kind, value)` da el
mismo autocompletado que `add_cache()` sin una función por tipo.

### Para el frontend

```ts
policiesJSONSchema()        // JSON Schema (zod 4 lo emite nativo) para pintar formularios
CACHE_MODES, DLP_CATEGORIES, DLP_ACTIONS, TRANSFORMATION_TYPES   // catálogos, para los <select>
defaultPolicies()           // documento por defecto, para inicializar el formulario
```

Que los catálogos se exporten evita que el front los duplique hardcodeados y se desincronicen.

### Tipos

`Policies`, `CachePolicy`, `DlpPolicy`, `GeoPolicy`, `FirewallPolicy`, `TransformationsPolicy`,
todos vía `z.infer` — nunca escritos a mano en paralelo al schema.

---

## 5b. Estructura de ficheros

```
src/
├── index.ts              única superficie pública: solo re-exporta
├── document.ts           sobre raíz + policiesJsonSchema()
├── parse.ts              parsePolicies / assertPolicies / resolvePolicies
├── builder.ts            policy().set().build()
├── errors.ts             fromZodError, PolicyValidationError
│
├── types/                contratos transversales
│   ├── index.ts          barrel
│   ├── issue.ts          PolicyIssue
│   ├── section.ts        PolicySection
│   ├── document.ts       Policies, ResolvedPolicies
│   ├── result.ts         ParseResult
│   └── builder.ts        PolicyBuilder
│
├── policies/             una policy por fichero
│   ├── index.ts          SECTIONS + los tipos derivados de SECTIONS
│   └── firewall.ts
│
└── internal/             primitivas, no exportadas
    ├── ip.ts
    └── domain.ts
```

Dos reglas mantienen esto ordenado:

- **Las dependencias van en un solo sentido** y `policies/*` nunca se importan entre sí.
  Si dos policies necesitan hablarse, la lógica sube a `document.ts`.
- **`types/` guarda solo contratos transversales.** Un tipo derivado de un schema concreto
  (`FirewallPolicy`) se queda en el fichero de su policy, y lo derivado de `SECTIONS`
  (`SectionKey`, `SectionInput`) vive junto a `SECTIONS`. Mover esos a `types/` invertiría
  las dependencias y devolvería los ciclos.

No se divide por `type` vs `interface`: es una frontera de sintaxis, no de dominio, y
obligaría a cambiar de fichero el día que un `interface` tenga que pasar a `type`.

## 6. Errores y warnings

La API ya tiene contrato: `details: [{ field: "dlp.options.entities.0", message }]`,
con `field` como **string con puntos** (se construye con `path.join('.')`, `'(root)'` si
está vacío) y **varios errores a la vez**.

Propongo emitir ambas formas, para no obligar a nadie a aplanar:

```ts
type PolicyIssue = {
  path:    (string | number)[];   // ["dlp","options","entities",0]→ para marcar el campo en el form
  field:   string;                // "dlp.options.entities.0"       → el contrato HTTP actual
  code:    string;                // "invalid_enum"                → estable, para i18n
  message: string;
};
```

**Warnings** (no bloquean, el documento es válido y se guarda): uso de `cache.mode: "semantic"`
sin implementar, reglas de firewall sombreadas, `cache.ttl_seconds` presente con `mode: "off"`.

⚠️ Los **códigos estables para i18n no existen hoy** en la API: su `code` es uno de siete
valores de proceso y el texto por campo es el mensaje crudo de zod, en inglés. Exponer `code`
desde aquí es gratis, pero aprovecharlo implica tocar `ErrorDetail` en la API. Petición aparte.

---

## 7. Reglas entre campos

Donde está el valor real, más allá de comprobar tipos:

- `cache.mode: "off"` ⇒ `ttl_seconds` y `min_similarity` a `null`
- `cache.mode: "strict"` ⇒ `ttl_seconds` requerido; `min_similarity` a `null`
- `cache.mode: "semantic"` ⇒ `ttl_seconds` requerido; `min_similarity` se rellena a `0.95`
- `geo.on_violation: "block"` ⇒ `geo.allow` no puede estar vacío (bloquearía todo)
- `dlp.enabled` ⇒ exige selección; `dlp.options.except` ⇒ sin `block` explícito (§4b)
- `firewall` ⇒ CIDR/IP/dominio bien formados; reglas sombreadas como warning
- `transformations[]` ⇒ sin `type` duplicado; `options` validado **por tipo**
  (unión discriminada), no como objeto libre

---

## 8. Empaquetado

Alineado con el baseline de `@axium-lab/helix`: ESM+CJS dual vía tsup, tipos emitidos una vez,
`files: ["dist","README.md"]`, scope `@axium-lab`, ES2022 / NodeNext.

Cambios respecto a lo que ya está montado:

- **zod 4 como `peerDependency`** (+ devDependency para desarrollo). Peer, no dependency:
  dos copias de zod en el árbol rompen `error instanceof ZodError`, que es de lo que depende
  el manejador de errores de la API para devolver 400 en vez de 500.
- **Quitar `types: ["node"]`** del tsconfig y no importar `node:*`: la librería corre también
  en el navegador.
- El backend corre con **Bun**, no Node: revisar si `engines.node` debe acompañarse de
  `engines.bun`.

### ⚠️ Acción pendiente en el repo de la API (bloquea la integración)

La API usa `zod ^3.23.8` y su `handleErrorApp` hace `error.errors`. En zod 4 eso pasó a
llamarse **`error.issues`**. Si esta librería publica con zod 4 contra ese backend sin
tocarlo, los errores de validación salen como **500 silencioso** en lugar de 400 legible.

Hay que migrar la API a zod 4 (o al menos adaptar `handleErrorApp`) **antes** de integrar.

---

## 9. Versionado y migraciones

`version` es la versión **del esquema del documento**, no una revisión de la policy.
No hay histórico, ni snapshots, ni rollback: `core.audit_logs` guarda texto libre, no
documentos JSON, así que no permite reconstruir una policy anterior.

La librería incluye `migrate(doc)`: v1 → vN según el `version` de entrada, ejecutado dentro
de `parse()`. Barato de montar ahora, carísimo de retrofitear cuando ya hay filas en producción.

Un documento sin `version` se trata como v1 (es el caso de las filas con el default `'{}'`).

---

## 10. Preguntas abiertas

Resueltas en la fase 1: forma del firewall (reglas ordenadas), direcciones (ambas),
defaults (sección ausente si no se configuró), zod 4, sin dependencias.

Descartado explícitamente: un `cache.scope` que controlase qué entra en la clave de caché
(app / api_key / usuario final). Queda como comportamiento implícito del runtime del proxy.
Con `semantic` activo, dos prompts *parecidos* de usuarios distintos comparten respuesta, así
que el aislamiento entre peticiones lo decide el proxy, no la policy.

Pendientes:

1. **Catálogos**: valor definitivo de `transformations.type`.
2. **`transformations[].options`**: qué opciones lleva `pdf_to_markdown`. Sin eso queda como
   objeto libre y se pierde la mitad del valor de validarlo.
3. **`geo`**: granularidad (alias `EU` + ISO 3166-1, o solo países) y cómo se reparte con
   `firewall.inbound`.
4. **i18n**: si merece la pena pedir el cambio de `ErrorDetail` en la API para aprovechar
   el `code` estable que la librería ya emite.
5. **Migración de la API a zod 4** (§8): bloquea la integración, no la librería.
