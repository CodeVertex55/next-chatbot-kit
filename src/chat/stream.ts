const EM_DASH = "\u2014";
const EN_DASH = "\u2013";
const WHITESPACE = /\s/;

/**
 * Rewrites dashes in streamed text. An em dash and the spaces around it become
 * a comma and a space. An en dash becomes a hyphen. State is kept between
 * chunks so the result does not depend on where the chunks were split.
 */
export function createPunctuationFilter(): { push(chunk: string): string; flush(): string } {
  let pendingSpace = "";
  let pendingComma = false;
  let emitted = false;

  return {
    push(chunk: string): string {
      let out = "";
      for (const char of chunk) {
        if (char === EM_DASH) {
          pendingSpace = "";
          pendingComma = true;
        } else if (WHITESPACE.test(char)) {
          if (!pendingComma) pendingSpace += char;
        } else {
          if (pendingComma) {
            if (emitted) out += ", ";
            pendingComma = false;
          } else {
            out += pendingSpace;
            pendingSpace = "";
          }
          out += char === EN_DASH ? "-" : char;
          emitted = true;
        }
      }
      return out;
    },

    flush(): string {
      const rest = pendingComma ? "" : pendingSpace;
      pendingSpace = "";
      pendingComma = false;
      emitted = false;
      return rest;
    },
  };
}
