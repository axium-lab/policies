import { z } from 'zod';

declare const POLICY_VERSION = 1;
/**
 * The root is loose on purpose: an older deployment doing read-modify-write must
 * not silently drop a section written by a newer one. Inside each section the
 * schema is strict, so a typo in a known section is still an error.
 */
declare const policiesSchema: z.ZodObject<{
    cache: z.ZodOptional<z.ZodPipe<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<{
            off: "off";
            strict: "strict";
            semantic: "semantic";
        }>>;
        ttl_seconds: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        min_similarity: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    }, z.core.$strict>, z.ZodTransform<{
        mode: "off" | "strict" | "semantic";
        ttl_seconds: number | null;
        min_similarity: number | null;
    }, {
        mode: "off" | "strict" | "semantic";
        ttl_seconds: number | null;
        min_similarity: number | null;
    }>>>;
    capture: z.ZodOptional<z.ZodObject<{
        samples: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    firewall: z.ZodOptional<z.ZodObject<{
        inbound: z.ZodPrefault<z.ZodObject<{
            default_action: z.ZodDefault<z.ZodEnum<{
                allow: "allow";
                deny: "deny";
            }>>;
            rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                action: z.ZodEnum<{
                    allow: "allow";
                    deny: "deny";
                }>;
                type: z.ZodLiteral<"cidr">;
                value: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
            }, z.core.$strict>>>;
        }, z.core.$strict>>;
        outbound: z.ZodPrefault<z.ZodObject<{
            default_action: z.ZodDefault<z.ZodEnum<{
                allow: "allow";
                deny: "deny";
            }>>;
            rules: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                action: z.ZodEnum<{
                    allow: "allow";
                    deny: "deny";
                }>;
                type: z.ZodLiteral<"cidr">;
                value: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
            }, z.core.$strict>, z.ZodObject<{
                action: z.ZodEnum<{
                    allow: "allow";
                    deny: "deny";
                }>;
                type: z.ZodLiteral<"domain">;
                value: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
            }, z.core.$strict>], "type">>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
    version: z.ZodDefault<z.ZodLiteral<1>>;
}, z.core.$loose>;
/**
 * JSON Schema for building forms. Derived from the *input* side: the front submits
 * what a person typed, before canonicalization.
 */
declare function policiesJsonSchema(): Record<string, unknown>;

/**
 * A single validation finding. `path` is for marking the field in a form; `field`
 * is the dotted string the API already returns in `details[].field`; `code` is
 * stable and safe to key translations off.
 *
 * Errors and warnings share this shape: what separates them is whether the
 * document is still valid, not how the finding is described.
 */
interface PolicyIssue {
    path: (string | number)[];
    field: string;
    code: string;
    message: string;
}

declare const FIREWALL_ACTIONS: readonly ["allow", "deny"];
declare const FIREWALL_RULE_TYPES: readonly ["cidr", "domain"];
/** Guardrail against dumping a routing table into an unindexed JSONB column. */
declare const FIREWALL_MAX_RULES = 256;
/**
 * `prefault` rather than `default`: a plain default is inserted as-is, so `{}` would
 * survive unparsed and the direction would come out with no fields at all.
 */
declare const schema$2: z.ZodObject<{
    inbound: z.ZodPrefault<z.ZodObject<{
        default_action: z.ZodDefault<z.ZodEnum<{
            allow: "allow";
            deny: "deny";
        }>>;
        rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
            action: z.ZodEnum<{
                allow: "allow";
                deny: "deny";
            }>;
            type: z.ZodLiteral<"cidr">;
            value: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
        }, z.core.$strict>>>;
    }, z.core.$strict>>;
    outbound: z.ZodPrefault<z.ZodObject<{
        default_action: z.ZodDefault<z.ZodEnum<{
            allow: "allow";
            deny: "deny";
        }>>;
        rules: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            action: z.ZodEnum<{
                allow: "allow";
                deny: "deny";
            }>;
            type: z.ZodLiteral<"cidr">;
            value: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
        }, z.core.$strict>, z.ZodObject<{
            action: z.ZodEnum<{
                allow: "allow";
                deny: "deny";
            }>;
            type: z.ZodLiteral<"domain">;
            value: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
        }, z.core.$strict>], "type">>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
type FirewallPolicy = z.infer<typeof schema$2>;
type FirewallRule = FirewallPolicy['outbound']['rules'][number];

/**
 * Every policy the document knows about. Adding one is a new file in this folder
 * plus one line here; nothing else in the package names a section explicitly.
 */
declare const SECTIONS: {
    readonly cache: {
        readonly key: "cache";
        readonly schema: z.ZodPipe<z.ZodObject<{
            mode: z.ZodDefault<z.ZodEnum<{
                off: "off";
                strict: "strict";
                semantic: "semantic";
            }>>;
            ttl_seconds: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
            min_similarity: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
        }, z.core.$strict>, z.ZodTransform<{
            mode: "off" | "strict" | "semantic";
            ttl_seconds: number | null;
            min_similarity: number | null;
        }, {
            mode: "off" | "strict" | "semantic";
            ttl_seconds: number | null;
            min_similarity: number | null;
        }>>;
    };
    readonly capture: {
        readonly key: "capture";
        readonly schema: z.ZodObject<{
            samples: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>;
    };
    readonly firewall: {
        readonly key: "firewall";
        readonly schema: z.ZodObject<{
            inbound: z.ZodPrefault<z.ZodObject<{
                default_action: z.ZodDefault<z.ZodEnum<{
                    allow: "allow";
                    deny: "deny";
                }>>;
                rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
                    action: z.ZodEnum<{
                        allow: "allow";
                        deny: "deny";
                    }>;
                    type: z.ZodLiteral<"cidr">;
                    value: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
                }, z.core.$strict>>>;
            }, z.core.$strict>>;
            outbound: z.ZodPrefault<z.ZodObject<{
                default_action: z.ZodDefault<z.ZodEnum<{
                    allow: "allow";
                    deny: "deny";
                }>>;
                rules: z.ZodDefault<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                    action: z.ZodEnum<{
                        allow: "allow";
                        deny: "deny";
                    }>;
                    type: z.ZodLiteral<"cidr">;
                    value: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
                }, z.core.$strict>, z.ZodObject<{
                    action: z.ZodEnum<{
                        allow: "allow";
                        deny: "deny";
                    }>;
                    type: z.ZodLiteral<"domain">;
                    value: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
                }, z.core.$strict>], "type">>>;
            }, z.core.$strict>>;
        }, z.core.$strict>;
        readonly lint: (value: FirewallPolicy, path: (string | number)[]) => PolicyIssue[];
    };
};
type SectionKey = keyof typeof SECTIONS;
type SectionSchema<Key extends SectionKey> = (typeof SECTIONS)[Key]['schema'];
/** What a caller passes in, before defaults and canonicalization are applied. */
type SectionInput<Key extends SectionKey> = z.input<SectionSchema<Key>>;

/** What you persist: sections that were never configured stay absent. */
type Policies = z.infer<typeof policiesSchema>;
type SectionOutputs = {
    [Key in SectionKey]: z.output<SectionSchema<Key>>;
};
/** Every section present, for the runtime that has to act on a decision. */
type ResolvedPolicies = Omit<Policies, SectionKey> & SectionOutputs;

type ParseResult = {
    ok: true;
    value: Policies;
    warnings: PolicyIssue[];
} | {
    ok: false;
    errors: PolicyIssue[];
};

/**
 * Validates and canonicalizes. The returned document is what you persist: sections
 * the user never configured stay absent, and the ones present are complete.
 */
declare function parsePolicies(input: unknown): ParseResult;
/** Same as `parsePolicies`, for callers that prefer an exception. */
declare function assertPolicies(input: unknown): Policies;
/**
 * Fills in the sections that were never configured. This is what the proxy runtime
 * consumes; it is not what you write back to the database.
 */
declare function resolvePolicies(input: unknown): ResolvedPolicies;

interface PolicyBuilder {
    set<Key extends SectionKey>(key: Key, value: SectionInput<Key>): PolicyBuilder;
    remove(key: SectionKey): PolicyBuilder;
    /** Validates and canonicalizes; throws `PolicyValidationError` if invalid. */
    build(): Policies;
    /** Same, without throwing, and with the warnings included. */
    safeBuild(): ParseResult;
}

/**
 * Immutable builder: every call returns a new one, so a draft can be shared
 * without anybody mutating it from under you.
 */
declare function policy(initial?: Record<string, unknown>): PolicyBuilder;

declare class PolicyValidationError extends Error {
    readonly issues: PolicyIssue[];
    constructor(issues: PolicyIssue[]);
}

/**
 * The contract every policy file fulfils. Schema, defaults, cross-field rules and
 * warnings all live in the section's own file, so adding a policy is one new file
 * plus one line in `SECTIONS`.
 */
interface PolicySection<Key extends string = string, Schema extends z.ZodType = z.ZodType> {
    readonly key: Key;
    readonly schema: Schema;
    /** Non-blocking findings. The document is still valid when these fire. */
    readonly lint?: (value: z.output<Schema>, path: (string | number)[]) => PolicyIssue[];
}

/** The real Postgres enum, `rm.cache_mode_enum`. */
declare const CACHE_MODES: readonly ["off", "strict", "semantic"];
declare const CACHE_TTL_MIN_SECONDS = 1;
/** 30 days. Without a ceiling, one extra zero caches for a year unnoticed. */
declare const CACHE_TTL_MAX_SECONDS = 2592000;
/**
 * Deliberately high: a low threshold serves more answers and gets more of them
 * wrong, and getting it wrong here means handing someone another request's answer.
 */
declare const CACHE_DEFAULT_MIN_SIMILARITY = 0.95;
/**
 * Filling the threshold after validation rather than defaulting the field keeps a
 * default from appearing on modes where it is not allowed.
 */
declare const schema$1: z.ZodPipe<z.ZodObject<{
    mode: z.ZodDefault<z.ZodEnum<{
        off: "off";
        strict: "strict";
        semantic: "semantic";
    }>>;
    ttl_seconds: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
    min_similarity: z.ZodDefault<z.ZodNullable<z.ZodNumber>>;
}, z.core.$strict>, z.ZodTransform<{
    mode: "off" | "strict" | "semantic";
    ttl_seconds: number | null;
    min_similarity: number | null;
}, {
    mode: "off" | "strict" | "semantic";
    ttl_seconds: number | null;
    min_similarity: number | null;
}>>;
type CachePolicy = z.infer<typeof schema$1>;
type CacheMode = (typeof CACHE_MODES)[number];

declare const schema: z.ZodObject<{
    samples: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
type CapturePolicy = z.infer<typeof schema>;

export { CACHE_DEFAULT_MIN_SIMILARITY, CACHE_MODES, CACHE_TTL_MAX_SECONDS, CACHE_TTL_MIN_SECONDS, type CacheMode, type CachePolicy, type CapturePolicy, FIREWALL_ACTIONS, FIREWALL_MAX_RULES, FIREWALL_RULE_TYPES, type FirewallPolicy, type FirewallRule, POLICY_VERSION, type ParseResult, type Policies, type PolicyBuilder, type PolicyIssue, type PolicySection, PolicyValidationError, type ResolvedPolicies, SECTIONS, type SectionInput, type SectionKey, assertPolicies, parsePolicies, policiesJsonSchema, policiesSchema, policy, resolvePolicies };
