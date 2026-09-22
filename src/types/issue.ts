/**
 * A single validation finding. `path` is for marking the field in a form; `field`
 * is the dotted string the API already returns in `details[].field`; `code` is
 * stable and safe to key translations off.
 *
 * Errors and warnings share this shape: what separates them is whether the
 * document is still valid, not how the finding is described.
 */
export interface PolicyIssue {
  path: (string | number)[];
  field: string;
  code: string;
  message: string;
}
