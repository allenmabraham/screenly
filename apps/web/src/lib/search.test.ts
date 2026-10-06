import assert from "node:assert/strict";
import test from "node:test";

import { escapeLikePattern } from "./search";

test("LIKE wildcards in library searches match literally", () => {
  assert.equal(escapeLikePattern("100%"), "100\\%");
  assert.equal(escapeLikePattern("a_b"), "a\\_b");
  assert.equal(escapeLikePattern("back\\slash"), "back\\\\slash");
  assert.equal(escapeLikePattern("plain words"), "plain words");
});
