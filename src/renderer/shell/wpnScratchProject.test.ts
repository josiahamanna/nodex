import assert from "node:assert/strict";
import test from "node:test";
import { computeNextScratchBufferTitle } from "./scratch-buffer-titles.ts";

test("computeNextScratchBufferTitle empty → Scratch", () => {
  assert.equal(computeNextScratchBufferTitle([]), "Scratch");
});

test("computeNextScratchBufferTitle only Scratch → Scratch-1", () => {
  assert.equal(computeNextScratchBufferTitle(["Scratch"]), "Scratch-1");
});

test("computeNextScratchBufferTitle Scratch + Scratch-1 → Scratch-2", () => {
  assert.equal(computeNextScratchBufferTitle(["Scratch", "Scratch-1"]), "Scratch-2");
});

test("computeNextScratchBufferTitle gap at Scratch-1 uses max+1", () => {
  assert.equal(computeNextScratchBufferTitle(["Scratch", "Scratch-2"]), "Scratch-3");
});

test("computeNextScratchBufferTitle ignores non-matching titles", () => {
  assert.equal(
    computeNextScratchBufferTitle(["Notes", "Scratch", "Other", "Scratch-1"]),
    "Scratch-2",
  );
});

test("computeNextScratchBufferTitle only Scratch-1 → Scratch", () => {
  assert.equal(computeNextScratchBufferTitle(["Scratch-1"]), "Scratch");
});

test("computeNextScratchBufferTitle trims whitespace on titles", () => {
  assert.equal(computeNextScratchBufferTitle(["  Scratch  "]), "Scratch-1");
});
